# 股票投资观点记录小程序 - 实现计划

## 概述

在已上线的小程序基础上迭代两个 MVP 能力：(1) 用 Tushare 每日收盘后自动同步自选股的最新行情，并在每只股票上提供「AI 今日简评」按钮（基于价格涨跌 + 联网搜索生成 100 字内的表现与原因总结）；(2) 支持上传 Markdown 文档到观点库，并绑定到自选股。目标平台是 **mobile（小程序）**。

**集成依赖**（必须使用，禁用自造轮子）：
- Supabase：数据持久化
- TOS 对象存储：截图 / 文档封面图
- 豆包大模型（LLM）：今日简评 / 跨观点分析 / 单图解读
- **Tushare HTTP API**：A 股日线行情（用户提供 token，写入 `server/.env` 的 `TUSHARE_TOKEN`）
- **Web Search 集成**：今日简评时联网拉取相关新闻（用于解释涨跌原因）

## 技术方案

| 维度 | 选择 | 理由 |
|---|---|---|
| 平台 | Taro 跨端小程序（mobile） | 既有项目 |
| 调度 | `@nestjs/schedule` cron | NestJS 原生支持，轻量 |
| 简评触发 | 手动按钮 | 用户明确要求 |
| 简评数据源 | Tushare 当日 K 线 + 联网搜索 | 用户确认 |
| 简评字数 | ≤ 100 字 | 用户要求 |
| MD 存储 | 复用 `notes` 表 + 新增 `type` 字段 | 简单统一（待用户给示例后确认） |
| MD 渲染 | Taro `RichText` + 服务端 markdown → HTML 转换 | 不引入重富文本编辑器 |
| 设计风格 | 2026 浅色玻璃拟态（已落地） | 沿用 |

## 功能模块

### 1. 每日行情同步（新增）
- **触发时机**：交易日 15:35 自动跑一次（cron `0 35 15 * * 1-5`）；同时为每只股票详情页提供「手动刷新」按钮，立即调 Tushare 拉最新一条
- **Tushare 接口**：`daily`，字段 `ts_code / trade_date / open / high / low / close / pre_close / change / pct_chg / vol / amount`
- **数据落库**：`stocks` 表新增字段 `last_price` / `change_pct` / `change_amount` / `price_date` / `volume` / `amount`；同时写入一张新的 `stock_prices` 表（`stock_id / trade_date / open / high / low / close / pre_close / pct_chg / vol / amount`，主键 `(stock_id, trade_date)`），用于历史 K 线查询
- **错误处理**：Tushare 限流/失败时记 `dev.log`，跳过失败项；非交易日不发请求

### 2. AI 今日简评（新增）
- **触发**：股票详情页右上新增「AI 简评」按钮 → POST `/api/ai/daily-brief`（body: `{ stockId }`）
- **后端流程**：
  1. 读 `stocks.last_price / change_pct / volume / amount` + 当日 K 线
  2. 加载 `web-search` 技能，搜索「{股票名} {trade_date} 涨/跌/异动」取前 3 条结果摘要
  3. 用豆包文本模型综合价格数据 + 搜索摘要，生成 ≤100 字简评
  4. 写入 `ai_reports` 表（`type = 'daily_brief'`），同时返回前端
- **前端**：点击后 loading 弹窗 → 跳转 AI 报告详情页（同 ai-report 复用）

### 3. Markdown 文档（新增，待用户给示例后确认存储结构）
- **新建** `/pages/note-edit` 顶部「观点 / 文档」二选一 Tab
- **文档模式字段**：标题（必填）/ Markdown 正文（必填）/ 关联股票（必填，单选）/ 标签（可选）/ 封面图（可选）
- **后端**：
  - 上传：若带图片走 `Network.uploadFile` 到 TOS；正文存 Supabase
  - 渲染：提供 `POST /api/notes/render-md` 接收 markdown，返回 sanitized HTML（防止 XSS），前端用 `RichText` 渲染
- **观点库展示**：在 `library` 列表中区分 `note` / `doc` 两种类型（doc 用 📄/文档徽章 + 关联股票名）

### 4. 数据结构扩展
```sql
-- stocks 表新增
ALTER TABLE stocks ADD COLUMN last_price numeric(10,2);
ALTER TABLE stocks ADD COLUMN change_pct numeric(8,4);
ALTER TABLE stocks ADD COLUMN change_amount numeric(10,4);
ALTER TABLE stocks ADD COLUMN price_date date;
ALTER TABLE stocks ADD COLUMN volume bigint;
ALTER TABLE stocks ADD COLUMN amount bigint;

-- 新建 stock_prices 表
CREATE TABLE stock_prices (
  stock_id uuid REFERENCES stocks(id) ON DELETE CASCADE,
  trade_date date NOT NULL,
  open numeric(10,2), high numeric(10,2), low numeric(10,2),
  close numeric(10,2), pre_close numeric(10,2),
  change_amount numeric(10,4), pct_chg numeric(8,4),
  vol bigint, amount bigint,
  PRIMARY KEY (stock_id, trade_date)
);

-- notes 表新增 type 字段
ALTER TABLE notes ADD COLUMN type varchar(16) DEFAULT 'note' NOT NULL;  -- 'note' | 'doc'
ALTER TABLE notes ALTER COLUMN direction DROP NOT NULL;
ALTER TABLE notes ALTER COLUMN entry_price DROP NOT NULL;
ALTER TABLE notes ALTER COLUMN target_price DROP NOT NULL;
ALTER TABLE notes ALTER COLUMN stop_loss DROP NOT NULL;

-- ai_reports 表新增 type='daily_brief'
-- 已有 type 字段，扩展枚举
```

## 是否有原型设计

**否**（设计引导工具已开启但本轮是已有项目功能迭代，沿用既有视觉规范即可；用户已确认浅色玻璃拟态风格）

## 实施步骤

1. **扩展数据模型 + Tushare Service**：在 Supabase 中执行 DDL（`stocks` 加字段、新建 `stock_prices`、`notes` 加 `type`）；`server/src/tushare/` 封装 Tushare HTTP 调用（带 5s 超时 + 限流 + token 读取）。`server/.env` 增加 `TUSHARE_TOKEN`。

2. **每日行情同步 + 手动刷新**：`server/src/stocks/daily-sync.service.ts` 用 `@nestjs/schedule` 注册 cron（交易日 15:35）；在 `stocks.controller.ts` 新增 `POST /api/stocks/:id/refresh-price` 手动刷新接口；前端 `stock` 详情页加「刷新」按钮。

3. **AI 今日简评**：`server/src/ai/daily-brief.service.ts` 加载 `web-search` 技能 + 调用豆包生成 ≤100 字简评；新增 `POST /api/ai/daily-brief` 端点；前端 `stock` 详情页加「AI 简评」按钮，loading 后跳转 `ai-report` 页。

4. **Markdown 文档**：`note-edit` 顶部加 Tab 切换「观点 / 文档」；文档模式下隐藏方向/价格/图片附件，新增 Markdown 编辑器 + 股票选择器；后端 `notes.service.ts` 兼容 `type='doc'`（方向/价格可选）；新增 `POST /api/notes/render-md`（用 `marked` + `dompurify` 转换）；`library` 列表区分两种类型；`note-detail` 根据 type 切换渲染（note 用 Text、doc 用 RichText）。

5. **样式对齐 + 联调**：股票详情页加「刷新 / AI 简评」按钮组；观点库列表项加类型徽章；`pnpm validate` 修复所有 error；端到端走通「添加自选股 → 等 cron 同步价格 → 触发 AI 简评 → 上传 MD 文档 → 观点库查看」全链路。

## 关键文件目录树

```
server/
├── .env                            # 新增 TUSHARE_TOKEN
├── src/
│   ├── stocks/
│   │   ├── daily-sync.service.ts   # cron + 拉取 Tushare
│   │   ├── stocks.controller.ts    # +POST /:id/refresh-price
│   │   ├── stocks.service.ts       # +price 字段处理
│   │   └── stocks.module.ts        # +ScheduleModule.forRoot()
│   ├── ai/
│   │   ├── daily-brief.service.ts  # 价格 + 联网搜索 + 豆包
│   │   ├── ai.controller.ts        # +POST /daily-brief
│   │   └── ai.module.ts
│   ├── notes/
│   │   ├── notes.service.ts        # 兼容 type='doc'
│   │   ├── notes.controller.ts     # +POST /render-md
│   │   └── notes.module.ts
│   └── tushare/                    # 新建模块
│       ├── tushare.service.ts
│       └── tushare.module.ts

src/
├── pages/
│   ├── stock/index.tsx             # +刷新/AI 简评按钮
│   ├── note-edit/index.tsx         # +观点/文档 Tab
│   ├── note-detail/index.tsx       # +按 type 渲染
│   └── library/index.tsx           # +类型徽章
├── components/
│   ├── md-editor.tsx               # 新建：Markdown 编辑器
│   └── type-badge.tsx              # 新建：note/doc 徽章
```

## 待用户确认

- [x] Tushare API token 已提供：`7fdb3...41d97`（已脱敏），完整值由用户写入 `server/.env` 的 `TUSHARE_TOKEN`，**不要提交到 git**
- [ ] MD 文档存储方案默认采用「复用 `notes` 表 + `type='doc'`」（基于典型财报研报 MD 格式推断）；若用户提供的样例包含特殊元素（Mermaid/嵌入 HTML/超大表格/图片附件等），再评估是否升级到独立 `documents` 表
