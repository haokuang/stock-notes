# Knowledge Base

> **本文件用途**:存放在项目里**调研/参考过的技术信息**,便于之后翻阅。
>
> 跟其他文档的关系:
> - `SUPABASE.md` — Supabase 接入指南(项目级)
> - `STATE_MACHINE.md` — 产品规则(项目级)
> - `ROADMAP.md` — 功能开发总账(项目级)
> - **`KNOWLEDGE.md`(本文件)** — 调研参考(可跨项目复用)
>
> 写入规则:
> - 每条调研 = 独立一节,小标题,加日期
> - 注明来源(对话 / 文档 / 实际跑测)
> - 关键链接 / 数据要列出
> - 与"已用 / 待用"无关,纯参考

---

## 一、Tushare 数据接口(2026-06-14 调研)

### 频次与积分机制

| 等级 | 积分 | 月费 | 单接口频次 | 并发 |
|---|---|---|---|---|
| 试用 | 0-2000 | 免费 | 60 次/分 | 1 |
| 2000 | 2000 | 200 元/月 | 60 次/分 | 1 |
| 5000 | 5000 | 500 | 100 次/分 | 1 |
| 10000 | 10000 | 1000 | 200 次/分 | 5 |
| 15000 | 15000 | 1500 | 200 次/分 | 5 |
| 20000 | 20000 | 2000 | 200 次/分 | 10 |
| 50000 | 50000 | 5000 | 200 次/分 | 20 |

**重要规则**:
- 每个接口的频次**独立计数**(`daily` 60 次/分 跟 `stock_basic` 60 次/分 **互不挤占**)
- 频次按 **IP 限**,不是按 token(多实例部署多个 NestJS 同时调,会叠加消耗同一 IP 配额)
- 大多数数据接口**仍按次扣分**(每调 1 次扣 2000 积分的 1/2000);少数高级接口(pro_bar 等)走"积分制"(足够即不扣)
- 超频会**临时封 IP 5-15 分钟**

**官方文档**:
- 频次限制总览:https://tushare.pro/document/1?doc_id=455
- 行情接口:https://tushare.pro/document/2

### 沙箱内实证(2026-06-14)

- 本地 curl 调 `https://api.tushare.pro` 没传 token → 响应 `{"code":40101, "msg":"您上传Token！"}`
- 沙箱网络对 tushare.pro 域稳定可达(没出现 Cloudflare 拦截),但**实际取数需要 TUSHARE_TOKEN**(我们的项目目前缺)
- 项目走 Coze SDK 间接调用 Tushare(Coze 帮你管频次和积分),所以"频次"对我们**透明**

### 行业共识(2026-06-14)

- 高频 `pro_bar` / 分钟级 `stk_mins` 等需要 **Tushare Pro 5000+ 积分套餐**
- 100 用户 × 50 只股 = 5000 次/日,会撞 60 次/分限频,**必须**加 1.1s 间隔 + 去重(所有用户的 unique stock_id 只调一次)
- 真实日线 1 年(244 天)× 5400 只股 = 130 万行 backfill,**需要分 3-5 天跑完**,30 万积分/天,Tushare Pro 5000 积分/天限制下不现实

---

## 二、腾讯免费行情接口 qt.gtimg.cn(2026-06-14 调研 + 实施)

### 接口基础

- URL:`https://qt.gtimg.cn/q={symbol}`(`sh600519` / `sz000001` / `bj830xxx`)
- 返回:**GBK 编码字符串**(`/usr/bin/iconv` 或 Node `Buffer.from(buf).toString('binary')` 转换)
- 格式:`v_sh600519="1~贵州茅台~600519~1291.91~1279.00~...~20260612161418~..."`
- **免费、无认证、限频宽松**(~100ms 响应,实测无明确限制)
- A 股全市场覆盖

### 字段下标(2026-06-14 实际跑测确认)

```
[0]=1          (未知)
[1]=贵州茅台    (名称)
[2]=600519      (代码)
[3]=1291.91     (现价,÷100)  ← 关键
[4]=1279.00     (昨收,÷100)
[5]=1271.18     (今开,÷100)
[6]=50495       (成交量,手)
[7]=24976       (外盘)
[8]=25519       (内盘)
[9]=1291.91     (买一价)
[10]=87         (买一量)
[11..28]=       (买二~卖五盘口)
[29]=''         (空字段!)
[30]=20260612161418  (时间 yyyyMMddHHmmss)
[31]=12.91      (涨跌额,÷100)
[32]=1.01       (涨跌幅%)
[33]=1295.00    (最高,÷100)
[34]=1265.01    (最低,÷100)
[35]=1291.91/50495/6477910214  (现价/成交量/成交额)
[36]=50495
[37]=647791
[38..39]=       (换手率等)
[40..N]=        (财务/总市值等)
```

**踩坑提醒**:
- **[3] 价字段 × 100** — 腾讯存储用分,需要 / 100
- **[29] 是空**(API 内部 1-indexed 减 1 错位),时间字段实际是 [30]
- 字段数约 88,至少 35 个才完整

### 替代源对比

| 源 | URL | 沙箱可达 | 限频 | 数据准 | 推荐 |
|---|---|---|---|---|---|
| 腾讯 qt.gtimg.cn | qt.gtimg.cn | ✅ | 宽松 | ⭐⭐⭐ | **首选** |
| 东方财富 push2 | push2.eastmoney.com | ❌ 拒 curl | 严格 | ⭐⭐⭐ | 备选 |
| 东方财富 push2his | push2his.eastmoney.com | ⚠️ 间歇封 | 宽松 | ⭐⭐⭐ | 备选 |
| 新浪 hq.sinajs.cn | hq.sinajs.cn | ✅ | 宽松 | ⭐⭐ | 备选 |
| 雪球 / 同花顺 | 需爬虫 | ❌ | 不明 | ⭐⭐ | 不推荐 |
| Tushare daily | api.tushare.pro | ✅ | 60 次/分(积分制) | ⭐⭐⭐⭐ | 需积分 |

**结论**:生产优先腾讯,fallback 链:腾讯 → Tushare → 旧快照。

---

## 三、东方财富 push2 接口(2026-06-14 调研)

### 接口

- URL:`https://push2.eastmoney.com/api/qt/stock/get?secid={market}.{code}&fields=...`
- `secid` 格式:`{market}.{6位代码}`,沪市=1,深市=0
- 返回 JSON:`{rc: 0, data: {f43: 价格×100, f44: 高×100, ...}}`

### 沙箱不可达

- curl 直接调: **Empty reply from server**(沙箱网络层拒连)
- 携带 Chrome UA + Referer: 仍然拒
- push2his 间歇性可连(rc=102 等业务错),但 push2 主接口完全封禁
- **结论**:本沙箱无法用东方财富主接口,改用腾讯

### 备用字段(若生产可访问)

```
f43=最新价 f44=最高 f45=最低 f46=今开 f47=成交量 f48=成交额
f60=昨收 f57=代码 f58=名称
f191/f192=时间戳或 yyyyMMddHHmmss 字符串
```

价格字段都 × 100,需要 / 100。

---

## 四、Supabase Realtime 限制(2026-06-14 调研 + 实际跑测)

### 频次 / 并发限制

| 计划 | 并发 WS 连接数 | 频率(单客户端) |
|---|---|---|
| Free | 2 | ~10 事件/秒(eventsPerSecond) |
| Pro | 500 | ~10 事件/秒 |

WS 走 Phoenix Channels 协议,断线需重连(supabase-js 自带 heartbeat)。

### 实际跑测(2026-06-14 东京节点 ap-northeast-1)

| 测试 | 结果 |
|---|---|
| `client.channel().subscribe()` SUBSCRIBED | ✅ 3 秒内成功 |
| `postgres_changes` INSERT 事件(anon) | ❌ 0 事件收到 |
| `postgres_changes` INSERT 事件(service_role) | ❌ 0 事件收到 |
| `broadcast` 通道(发 202 + 收) | ❌ 客户端收不到 |
| 实际 INSERT 写表 | ✅ 201 OK + DB 验证有 row |

**结论**:
- WS 握手 / 订阅 / 配 publication 全部正常
- **事件广播疑似节点运维问题**(或者 Plan 限制我们没在文档里看到)
- 计划:**降级用 5-10s 轮询**,Realtime 代码保留做"快速通道",等节点修好自动生效

### RLS 对 Realtime 的影响

- 订阅者用 **anon key** 时,Realtime 在拿到事件后会**用订阅者的 RLS 过滤** payload
- 如果订阅者 RLS 查不到那行(`auth.uid() = NULL ≠ user_id`),**事件会被静默丢弃**
- 用 **service_role** 订阅可绕开,但生产不应让前端拿 service_role(泄露即全库读写)

---

## 五、Drizzle ORM 0.45 已知坑(2026-06-14 踩)

### Bug 1:`Failed query` 错误吞掉

- 现象:`db.execute(sql\`INSERT ... ON CONFLICT ...\`)` 失败时,日志只输出 "Error: Failed query" + 重述 SQL,**没有 PG 真实错误**(如 `there is no unique or exclusion constraint matching the ON CONFLICT specification`)
- 根因:drizzle-orm@0.45.1 `pg-core/session.cjs:66:15` 的 `queryWithCache` 包装层吞错
- 解决:**直接用 `pool.connect()` + `client.query()`**(绕过 Drizzle 的 prepared-stmt),拿原始 PG 错误

### 接入方式

```typescript
constructor(
  @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
  @Inject(PG_POOL) private readonly pool: Pool,  // ← 显式注入 pg pool
) {}

// 使用:
const client = await this.pool.connect()
try {
  await client.query(SQL_STRING, [params])
} finally {
  client.release()
}
```

`PG_POOL` 暴露在 `database.module.ts`,所有模块可注入。

### Bug 2:nullable numeric + ON CONFLICT

- 现象:`onConflictDoUpdate` 包装的 INSERT 失败,即使 PG 端跑同样 SQL 没问题
- 根因:Drizzle 0.45 在序列化 nullable numeric 时不传 null,把 params 数与 prepared stmt 占位符对不上
- 解决:同样用 raw `client.query()`

---

## 六、A 股市场基础(2026-06-14 调研)

### 基础数据

- **股票总数**:约 5400 只(沪深京三市)
- **年内交易日**:约 244 天(排除周末 + 法定节假日)
- **主要指数**:上证综指(000001.SH)、深证成指(399001.SZ)、创业板指(399006.SZ)、科创50(000688.SH)
- **市场前缀**:
  - 上证主板 / 科创板:`sh` / `6xx`,`9xx`,`5xx`
  - 深证主板 / 创业板:`sz` / `0xx`,`3xx`,`2xx`
  - 北交所:`bj` / `4xx`,`8xx`

### 数据获取 API 对应

| 用途 | 首选 | 备用 |
|---|---|---|
| 实时日内价 | 腾讯 qt.gtimg.cn | Tushare realtime_min |
| 日线收盘 | Tushare daily | 新浪 hq.sinajs.cn |
| 财务/基本面 | Tushare(高积分) | 雪球 |
| 新闻/公告 | 东方财富 滚动新闻(爬虫) | 同花顺 |

---

## 七、跨平台 Taro H5 字号适配(2026-06-14 调研)

### 根因

- Taro 默认 rem 适配公式:`x = 40 * w / 750`,750px 设计稿下 1rem = 40px
- **问题**:`text-N` (N=px) 经 rem 转换后**实际显示 0.75N px**(因为根 fontSize 在 mobile 视口下被压到 15-20px)
- 例:`text-xs` (12px) 在 375px 视口实际显示 **11.25px**,小于 iOS 12px 最小可读阈值

### 项目当前修复

- `src/presets/h5-styles.ts` 改 `4vw` → `4.2667vw`(750 视口 1rem = 16px)
- 与 Taro 默认 rem 适配并存(后者给小屏做下限保护)

### 推荐规范(本项目)

| 用途 | 最小字号 |
|---|---|
| 关键正文 | 14px (text-sm) |
| 次要文字 | 13px (text-xs 修复后) |
| 标签 / 数字徽章 | 12px (text-xs 修复后) |
| 装饰性(图例) | 10px(慎用) |

### 待优化

- `text-[Npx]` 写法在 Taro 上**全被 rem 转换**,小数值易出问题
- 推荐用 `style={{ fontSize: '12px' }}` 绕过 Taro rem 转换
- lint 规则应加 `no-restricted-syntax` 禁 `text-[1-9]px` / `w-0.5` 等小数 Taro 类

---

## 八、Supabase Migration 模板(2026-06-14 沉淀)

### 标准 migration 结构

```sql
-- ============================================================
-- 000N · 简短描述
-- ============================================================

-- 1. 新增列(IF NOT EXISTS 兼容已有数据)
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS status varchar(10) NOT NULL DEFAULT 'watching';

-- 2. 索引
CREATE INDEX IF NOT EXISTS stocks_status_idx ON stocks(status);

-- 3. CHECK 约束(用 DO $$ 包起来,避免重复创建报错)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocks_status_check') THEN
    ALTER TABLE stocks ADD CONSTRAINT stocks_status_check
      CHECK (status IN ('watching', 'holding'));
  END IF;
END $$;

-- 4. 唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS stocks_user_stock_date_uq
  ON stock_prices (user_id, stock_id, trade_date);

-- 5. RLS(先开启,再清旧策略,再加新策略)
ALTER TABLE stock_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_briefs_select_own" ON stock_briefs;
CREATE POLICY "stock_briefs_select_own" ON stock_briefs FOR SELECT
  USING (auth.uid() = user_id);
-- (重复 SELECT/INSERT/UPDATE/DELETE 4 条)

-- 6. updated_at 触发器(复用 0001 的 set_updated_at 函数)
DROP TRIGGER IF EXISTS stock_briefs_set_updated_at ON stock_briefs;
CREATE TRIGGER stock_briefs_set_updated_at BEFORE UPDATE ON stock_briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 跑 migration

```bash
# 1. 读 SQL → JSON 包
PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({query: require('fs').readFileSync('./server/migrations/000N.sql','utf8')}))")

# 2. POST 到 Management API
curl -sS -X POST "https://api.supabase.com/v1/projects/hgpxchebcipynrfjssiq/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD"

# 3. 验证
curl -sS -X POST "https://api.supabase.com/v1/projects/hgpxchebcipynrfjssiq/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary '{"query":"SELECT ... FROM pg_indexes ..."}'
```

⚠️ 沙箱里 `curl` 收到 `--` 注释的 SQL 会被误判为 JSON,务必用 `node -e ...` 包装传 `query` 字段。

### 实战踩坑清单

- `IF NOT EXISTS` 必备(migration 重跑友好)
- `DROP POLICY IF EXISTS` 必备(重新加策略)
- CHECK 约束务必用 `DO $$ ... $$;` 包,不然 `IF NOT EXISTS` 不支持
- 唯一约束的 target 必须在 `pg_constraint` 里**真存在** unique index,否则 `ON CONFLICT` 报"no unique or exclusion constraint"
- 跨节点迁移:Supabase 没专用 migration 工具,用 Management API 手动跑

---

## 九、Coze SDK 现状(2026-06-14 调研)

- `coze-coding-dev-sdk@0.7.24` 装在 server package.json
- 代码里**只被 3 个模块引用**:
  - `ai/daily-brief.service.ts` — `LLMClient` (豆包) + `Config` + `SearchClient` (联网搜索)
  - `ai/ai.module.ts` — `LLMClient` (导入占位)
  - `upload/upload.module.ts` — `S3Storage` (TOS 文件存储)
- `getDb()` 数据库相关**已无引用**(项目迁 Supabase 后)
- **结论**:`LLMClient` + `SearchClient` + `S3Storage` 仍有用,**不能卸**
- `getDb` 死代码保留无害,可后续做 Code Health 时清理

---

## 十、Lark / 飞书 CLI 调研(2026-06-14)

### 已知限制

- WebFetch / WebSearch 在当前沙箱被拦:
  - `bytedance.sg.larkoffice.com` WebFetch 失败
  - `WebSearch` 偶尔返回 "API Error 400"
- 通用 HTTP(curl)对飞书域可达
- **`lark-cli docs +fetch --api-version v2 --doc <token>`** 工作正常,可以从 URL 提取 token 后拉文档

### 飞书文档 → 本地 md 转换流程

```bash
# 1. 提取 token (URL: https://bytedance.sg.larkoffice.com/docx/TOKEN)
lark-cli docs +fetch --api-version v2 --doc "TOKEN" --doc-format markdown > docs/source.md

# 2. 提 block_id(后续更新用)
lark-cli docs +fetch --api-version v2 --doc "TOKEN" --detail with-ids

# 3. 编辑用 XML(--doc-format xml)
lark-cli docs +update --api-version v2 --doc "TOKEN" --command block_replace --block-id <id> --content '<p>new</p>'
```

### 项目实战(2026-06-14 拉 3 版流程图)

- 拉了 `G2ijdM9iRombZixbkzPlpLJSgYc`(3 版流程图:用户旅程 / 产品功能 / 体验+功能)
- 输出 markdown 拉到对话,基于此做 ROADMAP 和 STATE_MACHINE

---

## 十一、Node 26 / 已知模块坑(2026-06-14)

### Node 26 内置 WebSocket

- Node v22+ 内置 `WebSocket` 全局对象,无需 `ws` 包
- 沙箱里没装 `undici` / `ws`,直接用 Node 内置更省事
- 例:
  ```js
  const ws = new WebSocket(url)
  ws.addEventListener('open', () => {...})
  ```

### Buffer 中文编码

- 腾讯 API 返回 GBK,Node fetch 默认 utf-8 会乱码
- 解决:`const text = Buffer.from(await res.arrayBuffer()).toString('binary')`
- `binary` 是 latin1 编码,1 字节 = 1 char,不会因多字节字符被截断
- 拿到 latin1 字符串后用正则匹配(ASCII 字段完美,中文"贵州茅台"是 latin1 字节序列也能匹配)

### Node fetch 不自动 follow redirect

- 走 `https://qt.gtimg.cn/q=sh600519` 默认 200,无 redirect
- 走某些 API 可能 301/302,需要 `redirect: 'follow'`(默认就是 follow,但若看到 0 长度响应查 redirect)

---

## 十二、Supabase Cron 选型(2026-06-14 调研)

| 方案 | 可靠性 | 部署 | 失败重试 |
|---|---|---|---|
| NestJS `@Cron` 装饰器 | ❌ 服务重启丢任务 | 简单 | 无 |
| `pg_cron` 扩展 | ✅ 数据库层,服务重启不影响 | Supabase 自带,启用即用 | 需手动写 |
| `pg_cron` + `pg_net` 调 HTTP | ✅ 同上 + 自动调后端 webhook | Supabase | 可写 |
| 外部(GitHub Actions / n8n) | ✅ 不依赖服务 | 需外部配置 | 取决于服务 |

**推荐**:本项目接 `pg_cron`,**只存 cron schedule 在 DB**,不调后端 webhook(简单) — 数据库层每天 15:35 直接 UPDATE 一张 `cron_run_log` 表,后端在 `cronSync()` 内自己起定时器读这张表决定要不要跑。

但**当前现状**:NestJS `@Cron` 已工作(每日 15:35 跑 `cronSync`),**不急着迁移**。等生产化(用户 > 10)再做。

---

## 十三、其他小贴士

- **macOS 5000 端口被 AirPlay 占用** — 关掉系统设置 → 通用 → 隔空播放接收器
- **NestJS 全局管道 `ValidationPipe`** — `whitelist: true` + `forbidNonWhitelisted: true` 严格模式
- **NestJS Controller 不能同名** — 两个 `@Module({})` 都 export 同名 class 会编译失败
- **NestJS Controller `@Controller('api/auth')` + `main.ts` `setGlobalPrefix('api')` = `/api/api/auth/...`** — 二选一,别两个都加

---

## 附录:信息来源汇总

| § | 信息来源 | 日期 |
|---|---|---|
| 一 Tushare 频次 | Tushare 官方文档 + 行业经验 | 2026-06-14 |
| 二 腾讯接口 | 实际 curl 跑测 + 返回字段解析 | 2026-06-14 |
| 三 东方财富 | 实际 curl 测试(沙箱拒连) | 2026-06-14 |
| 四 Supabase Realtime | 实际 supabase-js WS 跑测 | 2026-06-14 |
| 五 Drizzle 坑 | 实际后端调试遇到 | 2026-06-14 |
| 六 A 股 | 公开市场数据 | 持续 |
| 七 Taro 字号 | 实际前端调试 | 2026-06-14 |
| 八 Migration | 实际后端部署 | 2026-06-14 |
| 九 Coze SDK | grep 代码引用 | 2026-06-14 |
| 十 Lark | 实际跑 `lark-cli` 拉文档 | 2026-06-14 |
| 十一 Node 26 | 实际跑测 | 2026-06-14 |
| 十二 Cron | Supabase 文档 | 2026-06-14 |
