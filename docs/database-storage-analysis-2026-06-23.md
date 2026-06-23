# 数据库存储方式诊断与慢速分析

> 分析日期：2026-06-23
> 分析对象：stock_notes 项目（Supabase Postgres + Drizzle ORM + NestJS）
> 复核结论：当前方案判断方向基本正确；需要补充首页/详情页常用接口的多次数据库往返，并弱化“raw client.query() 本身导致慢”的表述。核心问题更像是 **跨区 RTT × 多 SQL round-trip × 少数串行/N+1 路径**。

## 一、当前存储方式

| 层 | 技术 | 用途 |
| --- | --- | --- |
| 托管 | **Supabase Postgres**（项目 `hgpxchebcipynrfjssiq`，区域 `ap-northeast-1` 东京） | 主存储 |
| 连接 | **Supavisor pooler**（`aws-1-ap-northeast-1.pooler.supabase.com:6543`，transaction 模式） | 连接池 |
| 驱动 | `pg` Pool（`max: 10`）+ **Drizzle ORM** | 后端 NestJS |
| 前端 | Supabase JS Client（仅 anon key） | **只用于 Realtime 订阅**，不直接读写表 |
| 文件 | TOS / S3 兼容对象存储 | 图片等文件资产；Postgres 只保存 URL / metadata |

Schema 覆盖 `stocks` / `notes` / `stock_prices` / `agent_*` / `stock_briefs` / `note_highlights` 等 10+ 张表，索引建得比较完整。

关键代码位置：

- 连接配置：`server/src/storage/database/connection-config.ts`
- 模块装配：`server/src/storage/database/database.module.ts`
- Schema 定义：`server/src/storage/database/shared/schema.ts`
- 前端 Supabase 客户端：`src/lib/supabase.ts`

### 连接配置要点（`connection-config.ts`）

- 默认 profile = `pooler-transaction`（端口 6543，走 Supavisor 事务级池）
- `Pool` 配置：`max: 10`、`idleTimeoutMillis: 30_000`、`connectionTimeoutMillis: 10_000`
- SSL：`rejectUnauthorized: false`（`?sslmode=no-verify`）

### 数据库模块装配（`database.module.ts`）

- 提供 `PG_POOL`（原生 pg Pool）、`DRIZZLE_DB`（drizzle 包装）、`SUPABASE_CLIENT`（service_role，仅后端用）
- 后端 Supabase Client 配置 `autoRefreshToken: false, persistSession: false`

### 前端 Supabase 客户端（`src/lib/supabase.ts`）

- 只注入 anon key（build-time 字面量），**严禁 service_role 进前端 bundle**
- 仅用于 Realtime 订阅（`postgres_changes`），不直接读写表
- Realtime 限速 `eventsPerSecond: 10`

### 需要特别注意的 Supavisor transaction 模式

当前默认连接走 `pooler-transaction`（6543）。这适合短连接、高并发、serverless/多实例场景，但它的典型限制是：**不支持跨事务持久化的 prepared statements**。Supabase 官方文档也明确建议 transaction mode 下关闭 prepared statements。

因此，项目里部分写入路径用 raw `client.query()` 绕开 Drizzle prepared-statement 兼容问题，这个方向是合理的。性能问题的主因不应简单归咎为“raw query 比 Drizzle 慢”，而应看：

- 一次请求里发了多少条 SQL；
- 这些 SQL 是并发还是串行；
- 应用服务器与 Supabase 数据库是否同区域；
- 是否存在 N+1 / 循环内 query。

## 二、为什么慢 —— 按影响排序

### 1. 跨地域网络延迟（基础成本，所有 SQL 都会放大）

到 pooler 的 TCP 延迟实测：

```
尝试 1: 49.5 ms
尝试 2: 44.6 ms
尝试 3: 42.4 ms
```

这是从开发机（Mac）测的。**如果 NestJS 应用服务器不在东京（ap-northeast-1）**，每条 SQL 的 RTT 会更高，所有串行 query 的延迟直接被放大。需要确认应用部署在哪个区域。

经验判断：

- 应用服务器与 DB 同区域：单条简单 SQL 常见为几毫秒级；
- 应用服务器跨区访问东京 DB：每条 SQL 先天然多几十毫秒；
- 串行 4 条 SQL 就可能额外叠出 150-250ms；
- 循环内 10 条 UPDATE 就可能额外叠出 400ms+。

### 2. 首页 `summary()` 四个串行 count（常用路径，ROI 很高）

`server/src/stocks/stocks.service.ts` 的 `summary(uid)` 当前按顺序执行：

- `stocks` count
- `notes` count
- `ai_reports` count
- `notes` 中 `bull` count

这会导致首页 summary 至少 4 次数据库 round-trip。因为首页每次打开/显示都可能加载，这条路径的体感影响会很明显。

当前写法简化后类似：

```ts
const [stockCount] = await this.db.select(...).from(stocks).where(...)
const [noteCount] = await this.db.select(...).from(notes).where(...)
const [reportCount] = await this.db.select(...).from(aiReports).where(...)
const bullCount = await this.db.select(...).from(notes).where(...)
```

这类统计完全可以合并为一条 SQL，用 CTE 或 scalar subquery 一次返回。

### 3. 事务内 N+1 串行 UPDATE（笔记详情/高亮路径）

`server/src/notes/highlight-persistence.ts:166-184` 的 `reconcileNoteHighlights`：

```ts
for (const v of valid) {
  await client.query(
    `UPDATE note_highlights
     SET start_offset = $1, end_offset = $2, source_hash = $3, updated_at = now()
     WHERE id = $4 AND user_id = $5 AND note_id = $6`,
    [v.start_offset, v.end_offset, v.source_hash, v.id, v.user_id, v.note_id],
  )
}
```

每个高亮一次 round-trip。**N 个高亮 = N 次 RTT 串行相加**。10 个高亮在东京链路上就是 ~450ms 起步，这是单次请求里的纯等待。

这条路径会在 `NotesService.getById()` 打开笔记详情时触发：

- 先查 note；
- markdown render；
- 查已有 `note_highlights`；
- 本地重定位；
- 对有效高亮逐条 UPDATE；
- 删除失效高亮；
- 返回注入高亮后的 HTML。

因此它不仅是“保存高亮慢”，也会影响打开有高亮的长文档。

### 4. 详情页多接口 fan-out（不是单条 SQL 慢，而是接口数多）

股票详情页当前会先请求：

- `/api/stocks/:id`

拿到 subject type 后，再并发请求：

- `/api/notes?stock_id=...&limit=100`
- `/api/notes/summary/:stockId`
- `/api/notes/distribution/:stockId`
- `/api/stocks/:stockId/stop-loss-alert`（股票模式）
- `/api/stocks/:stockId/brief?days=7`（股票模式）
- Agent reports

虽然这些请求大多是并发，但体感仍会受最慢接口影响。更重要的是：每个接口后端又可能各自发 1-2 条 SQL。跨区时，接口 fan-out 会把 RTT 成本放大。

这不是 schema 索引问题，而是 API 聚合策略问题。可以考虑详情页后端提供一个聚合端点，例如：

```text
GET /api/stocks/:id/detail
```

一次返回 stock、notes、summary、distribution、briefs、agentReports 等页面首屏需要的数据。

### 5. `persistDailyBriefArtifacts` 一次写入两条表

`server/src/ai/daily-brief-persistence.ts:42-108` 在一个事务里串行执行 `INSERT stock_briefs` + `INSERT notes`，2 次 RTT ≈ 90ms。这条路径在每日 cron 或批量生成简评时会按股票数量放大。

这条路径不一定是用户日常页面最慢的第一来源，但它适合顺手优化：用一条带 CTE 的 SQL 合并两次 INSERT/UPSERT。

### 6. Agent / AI 慢不一定是数据库慢

Agent 对话、报告生成、单图解读等路径还会经过：

- LLM API；
- 联网搜索；
- 工具调用；
- Realtime 推送；
- 后台 worker 排队。

这类场景如果慢，不能直接归因于 Postgres。需要在接口层打耗时日志，把 DB 时间、LLM 时间、搜索时间、worker 排队时间拆开看。

### 7. 连接池 `max: 10`

Supabase 小档下连接数有限，10 偏保守但安全。并发请求一多可能排队，表现为偶发卡顿。

不过，不建议第一步就盲目把 `max` 拉到 15-25。原因：

- Supavisor / Supabase 项目本身有连接上限；
- Realtime 也会占用数据库连接池；
- 如果慢的主因是跨区 RTT 和串行 SQL，增大 pool 只能缓解排队，不能减少单请求耗时。

建议先做 SQL round-trip 合并，再根据压测观察 pool 等待时间。

## 三、不是问题的部分

- Schema 索引建得很全（`user_id` / `stock_id` / `created_at` / 复合唯一索引都有），查询计划层面没问题
- 前端只拿 anon key 做 Realtime，没有重复请求问题
- SSL 与连接字符串配置正确，无凭证泄露风险
- raw `client.query()` 不是天然问题；在 transaction pooler 下规避 prepared statement 兼容性是合理选择
- 文件资产没有塞进 Postgres，大图/截图走对象存储，数据库只保存 URL/JSON metadata

## 四、优化建议（按 ROI 排序）

| 优先级 | 优化 | 预期收益 | 风险 |
| --- | --- | --- | --- |
| P0 | 确认应用服务器与数据库**同区域**（都放 ap-northeast-1，或迁移数据库到应用同区） | RTT 从几十 ms 降到几 ms，所有 DB 请求受益 | 低；需要看部署平台是否支持 |
| P0 | `stocks.summary()` 四个 count 合成一条 SQL | 首页 summary 从 4×RTT → 1×RTT | 低，返回结构不变 |
| P1 | `reconcileNoteHighlights` 改成 **batch UPDATE**（用 `unnest` 数组一次性更新所有 valid 行） | N×RTT → 1×RTT，10 高亮省 ~400ms | 低，有 `highlight-persistence.test.ts` 兜底 |
| P1 | 为详情页增加聚合端点，减少前端多接口 fan-out | 首屏接口数下降，跨区收益明显 | 中，需要前后端一起改 |
| P2 | `persistDailyBriefArtifacts` 用一条带 CTE 的 SQL 把两次 INSERT 合并 | 省 1×RTT；批量 cron 更明显 | 低 |
| P2 | 增加轻量耗时日志：DB / LLM / 搜索 / worker queue 分段 | 让后续优化不靠猜 | 低 |
| P3 | 若应用必须跨区，考虑局部缓存或读模型聚合 | 减少远距离调用次数 | 中 |
| P3 | 连接池 `max` 视 Supabase 档位和压测结果调到 15-25 | 缓解并发排队 | 中，需注意 Supabase 连接上限和 Realtime 连接占用 |
| P3 | 评估 `pooler-session`（5432）或 direct/dedicated pooler | 可能改善 prepared statement/延迟场景 | 中高，需结合部署形态和连接数 |

## 五、推荐落地批次

### Batch 1：低风险代码优化（建议先做）

- [ ] `stocks.summary()` 合并为一条 SQL。
- [ ] 为 summary 增加/调整单测，确保返回结构不变。
- [ ] `reconcileNoteHighlights` 改 batch UPDATE。
- [ ] 跑 `highlight-persistence.test.ts`、相关 notes tests、`pnpm validate`。

### Batch 2：部署与观测

- [ ] 确认 NestJS 应用服务器部署区域是否 = `ap-northeast-1`。
- [ ] 在 NestJS 增加请求耗时日志，至少记录：
  - route；
  - 总耗时；
  - 关键 DB 查询耗时；
  - LLM/搜索耗时（Agent 路径）；
  - worker queue 等待时间（Agent 路径）。
- [ ] 记录首页、详情页、笔记详情、Agent 对话四类代表请求的 p50/p95。

### Batch 3：页面聚合与批量写入

- [ ] 为股票详情页设计聚合端点，减少前端多接口首屏请求。
- [ ] `persistDailyBriefArtifacts` 用 CTE 合并 brief + note 写入。
- [ ] 对日常首页/详情页做压测或本地多次采样，对比优化前后耗时。

### Batch 4：连接池/架构参数（有数据后再调）

- [ ] 根据 Supabase 套餐和 `pg_stat_activity` / pool 等待情况评估 `Pool.max`。
- [ ] 若后端是长驻服务且连接数可控，再评估 `pooler-session`。
- [ ] 若必须跨区，优先做缓存/聚合端点，而不是单纯加连接数。

## 六、方案靠谱度评估

整体评价：**靠谱，但原文优先级需要调整。**

靠谱的点：

- 判断主存储是 Supabase Postgres，连接走 Supavisor transaction pooler，准确。
- 判断前端 Supabase 仅用于 Realtime，不直接读写业务表，准确。
- 指出 `reconcileNoteHighlights` 存在循环内串行 UPDATE，准确，而且是应优先修的真实性能问题。
- 指出应用与 DB 同区域很重要，准确。
- 指出 transaction pooler 下 prepared statement 兼容性问题，准确。

需要修正/补充的点：

- “N+1 高亮 UPDATE 最严重”不一定总是最严重。它只在打开/更新有多个高亮的笔记时明显；首页常态慢更可能来自 summary 串行 count + 多接口加载。
- “raw client.query() 造成慢”不应作为主要结论。raw SQL 在当前架构下是合理规避；真正要优化的是 round-trip 数量和串行结构。
- `persistDailyBriefArtifacts` 是可优化项，但不是用户日常首屏慢的第一嫌疑。
- `Pool.max` 不建议早调，应该放在有观测数据之后。

一句话结论：

> 当前数据库 schema 和索引整体没大问题；速度慢更像是部署区域与请求形态问题。优先减少单次页面加载里的 SQL/接口 round-trip，再考虑连接池和 pooler 模式。
