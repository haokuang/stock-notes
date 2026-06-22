# A股大盘研究标的 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许每个用户添加唯一的「A股大盘」研究标的，并围绕它写笔记、上传文档、问 AI，同时隔离所有个股行情和交易能力。

**Architecture:** 在现有 `stocks` 聚合中增加 `subject_type` 区分普通股票与市场研究标的，继续复用 `stock_id` 驱动的笔记和 Agent 数据链路。后端用固定创建接口和类型守卫维护边界，前端用共享类型与详情模式配置决定请求和展示，Agent 根据标的类型调整提示词、工具集合和联网检索词。

**Tech Stack:** NestJS、Drizzle ORM、PostgreSQL/Supabase、Taro React、TypeScript、Tailwind CSS、`@/components/ui`、Node.js test runner、pnpm

---

## 文件结构

- `server/migrations/0012_market_subject.sql`：增加 `subject_type` 列和数据库约束。
- `server/src/stocks/stock-subject.ts`：后端标的类型、固定大盘身份、能力守卫和错误类型。
- `server/src/stocks/market-subject.persistence.ts`：以参数化 SQL 原子创建唯一大盘记录。
- `server/src/stocks/market-subject.test.ts`：迁移、固定身份、创建和能力守卫测试。
- `server/src/stocks/stocks.service.ts`：创建大盘、普通股票类型写入、个股能力保护。
- `server/src/stocks/stocks.controller.ts`：暴露 `POST /stocks/market` 并保护委托给其他服务的个股接口。
- `server/src/stocks/daily-sync.service.ts`：批量同步跳过大盘，单标的同步和历史查询拒绝大盘。
- `server/src/ai/daily-brief.service.ts`：个股简评拒绝大盘标的。
- `server/src/agent/agent.repository.ts`：Agent 股票画像返回 `subjectType`。
- `server/src/agent/context/system-prompt.ts`：生成股票模式或大盘模式系统提示词。
- `server/src/agent/context/agent-context.builder.ts`：按标的类型筛选 Agent 工具。
- `server/src/agent/tools/stock-news.tool.ts`：大盘模式使用“A股市场”检索词。
- `server/src/agent/agent.module.ts`、`server/src/agent/agent-orchestrator.ts`：传递完整标的身份。
- `src/stocks/subject.ts`：前端共享标的类型、常量和展示辅助函数。
- `src/stocks/subject.test.ts`：前端标的类型测试。
- `src/pages/stock-add/index.tsx`：增加固定大盘卡片和创建动作。
- `src/pages/stock/stock-detail-logic.ts`、`src/pages/stock/stock-detail-logic.test.ts`：详情模式请求和可见能力配置。
- `src/pages/stock/index.tsx`：按详情模式加载和展示。
- `src/pages/index/index.tsx`、`src/pages/library/index.tsx`、`src/pages/profile/index.tsx`、`src/pages/stock-search/index.tsx`：识别并标记大盘研究对象。
- `src/pages/note-edit/index.tsx`：使用“研究对象”文案并展示大盘标签。

### Task 1: 建立标的类型与数据库迁移

**Files:**
- Create: `server/migrations/0012_market_subject.sql`
- Create: `server/src/stocks/stock-subject.ts`
- Create: `server/src/stocks/market-subject.test.ts`
- Modify: `server/src/storage/database/shared/schema.ts`

- [ ] **Step 1: 写迁移与领域常量的失败测试**

在 `server/src/stocks/market-subject.test.ts` 写入：

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MARKET_SUBJECT,
  assertEquityOperationAllowed,
  isMarketSubject,
} from './stock-subject'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0012_market_subject.sql'),
  'utf8',
)

test('migration adds a constrained stock subject type with a stock default', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS subject_type varchar\(10\)/)
  assert.match(migration, /DEFAULT 'stock'/)
  assert.match(migration, /CHECK \(subject_type IN \('stock', 'market'\)\)/)
})

test('defines the one fixed A-share market subject', () => {
  assert.deepEqual(MARKET_SUBJECT, {
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subjectType: 'market',
  })
  assert.equal(isMarketSubject({ subject_type: 'market' }), true)
  assert.equal(isMarketSubject({ subject_type: 'stock' }), false)
})

test('market subjects reject equity-only operations', () => {
  assert.throws(
    () => assertEquityOperationAllowed({ subject_type: 'market' }),
    /大盘标的不支持此操作/,
  )
  assert.doesNotThrow(() => assertEquityOperationAllowed({ subject_type: 'stock' }))
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/market-subject.test.ts`

Expected: FAIL，提示缺少 `0012_market_subject.sql` 或 `./stock-subject`。

- [ ] **Step 3: 写迁移、领域常量和 schema**

`server/migrations/0012_market_subject.sql`：

```sql
ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS subject_type varchar(10) NOT NULL DEFAULT 'stock';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stocks_subject_type_check'
  ) THEN
    ALTER TABLE stocks
      ADD CONSTRAINT stocks_subject_type_check
      CHECK (subject_type IN ('stock', 'market'));
  END IF;
END
$$;
```

`server/src/stocks/stock-subject.ts`：

```ts
import { BadRequestException } from '@nestjs/common'

export type StockSubjectType = 'stock' | 'market'

export const MARKET_SUBJECT = {
  code: 'MARKET_A_SHARE',
  name: 'A股大盘',
  subjectType: 'market' as const,
}

export interface StockSubjectLike {
  subject_type?: StockSubjectType | null
}

export function isMarketSubject(subject: StockSubjectLike): boolean {
  return subject.subject_type === 'market'
}

export function assertEquityOperationAllowed(subject: StockSubjectLike): void {
  if (isMarketSubject(subject)) {
    throw new BadRequestException('大盘标的不支持此操作')
  }
}
```

在 `server/src/storage/database/shared/schema.ts` 的 `stocks` 字段中加入：

```ts
subject_type: varchar('subject_type', { length: 10 }).default('stock').notNull(),
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/market-subject.test.ts`

Expected: 3 tests PASS。

- [ ] **Step 5: 提交模型变更**

```bash
git add server/migrations/0012_market_subject.sql server/src/stocks/stock-subject.ts server/src/stocks/market-subject.test.ts server/src/storage/database/shared/schema.ts
git commit -m "feat: 增加市场研究标的类型"
```

### Task 2: 创建唯一大盘并保护个股后端能力

**Files:**
- Modify: `server/src/stocks/market-subject.test.ts`
- Create: `server/src/stocks/market-subject.persistence.ts`
- Modify: `server/src/stocks/stocks.service.ts`
- Modify: `server/src/stocks/stocks.controller.ts`
- Modify: `server/src/stocks/daily-sync.service.ts`
- Modify: `server/src/ai/daily-brief.service.ts`

- [ ] **Step 1: 写固定创建记录和同步筛选的失败测试**

向 `server/src/stocks/market-subject.test.ts` 增加：

```ts
import {
  buildMarketSubjectValues,
  filterEquitySubjects,
} from './stock-subject'
import { insertMarketSubject } from './market-subject.persistence'

test('builds server-owned market values without client input', () => {
  assert.deepEqual(buildMarketSubjectValues('user-1'), {
    user_id: 'user-1',
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subject_type: 'market',
    industry: null,
    status: 'watching',
    sort_order: 0,
  })
})

test('batch quote sync keeps only equity subjects', () => {
  const result = filterEquitySubjects([
    { id: 'market-1', code: 'MARKET_A_SHARE', subject_type: 'market' as const },
    { id: 'stock-1', code: '600519', subject_type: 'stock' as const },
  ])
  assert.deepEqual(result.map((item) => item.id), ['stock-1'])
})

test('atomically inserts the fixed market subject', async () => {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const client = {
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values })
      return { rows: [{ id: 'market-1', ...buildMarketSubjectValues('user-1') }] }
    },
  }
  const row = await insertMarketSubject(client as never, 'user-1')
  assert.equal(row.id, 'market-1')
  assert.match(calls[0].text, /ON CONFLICT \(user_id, code\) DO NOTHING/)
  assert.deepEqual(calls[0].values, [
    'user-1', 'MARKET_A_SHARE', 'A股大盘', 'market', 'watching', 0,
  ])
})

test('reports a duplicate market subject when the atomic insert returns no row', async () => {
  const client = { query: async () => ({ rows: [] }) }
  await assert.rejects(
    () => insertMarketSubject(client as never, 'user-1'),
    /市场大盘已在自选中/,
  )
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/market-subject.test.ts`

Expected: FAIL，提示 `buildMarketSubjectValues`、`filterEquitySubjects` 或 `insertMarketSubject` 未定义。

- [ ] **Step 3: 实现固定值、创建接口和重复保护**

在 `stock-subject.ts` 增加：

```ts
export function buildMarketSubjectValues(userId: string) {
  return {
    user_id: userId,
    code: MARKET_SUBJECT.code,
    name: MARKET_SUBJECT.name,
    subject_type: MARKET_SUBJECT.subjectType,
    industry: null,
    status: 'watching' as const,
    sort_order: 0,
  }
}

export function filterEquitySubjects<T extends StockSubjectLike>(items: T[]): T[] {
  return items.filter((item) => !isMarketSubject(item))
}
```

新增 `market-subject.persistence.ts`，通过一次原子 SQL 创建记录：

```ts
import type { PoolClient } from 'pg'
import { MARKET_SUBJECT } from './stock-subject'

export class MarketSubjectExistsError extends Error {
  constructor() {
    super('市场大盘已在自选中')
  }
}

export async function insertMarketSubject(client: PoolClient, userId: string) {
  const result = await client.query(
    `INSERT INTO stocks
       (user_id, code, name, subject_type, industry, status, sort_order)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)
     ON CONFLICT (user_id, code) DO NOTHING
     RETURNING *`,
    [userId, MARKET_SUBJECT.code, MARKET_SUBJECT.name, MARKET_SUBJECT.subjectType, 'watching', 0],
  )
  if (!result.rows[0]) throw new MarketSubjectExistsError()
  return result.rows[0]
}
```

在 `StocksService` 增加 `createMarket(uid)`：从 pool 取得 client，调用 `insertMarketSubject()`，始终释放 client；将 `MarketSubjectExistsError` 转换为 `ConflictException('市场大盘已在自选中')`，不调用 `refreshPrice`。

在 `StocksController` 的 `@Get(':id')` 之前增加，避免动态路由吞掉 `market`：

```ts
@Post('market')
@HttpCode(200)
async createMarket(@CurrentUser() user: { id: string }) {
  const data = await this.service.createMarket(user.id)
  return { data }
}
```

普通 `create()` 插入值显式加入 `subject_type: 'stock'`。

- [ ] **Step 4: 为所有个股能力加双层类型保护**

在 `StocksService` 的 `refreshPrice`、`buy`、`sell`、`getStopLossAlert`、`getRefreshStatus` 中，在取得当前用户标的后调用：

```ts
assertEquityOperationAllowed(stock)
```

为 Controller 委托给 `DailySyncService` 或 `DailyBriefService` 的接口增加一个公共校验方法：

```ts
async assertEquitySubject(uid: string, stockId: string): Promise<void> {
  const stock = await this.getById(uid, stockId)
  assertEquityOperationAllowed(stock)
}
```

在 `history`、`generateBrief`、`recentBriefs` Controller 方法调用委托服务前执行该校验。`DailyBriefService.generateBrief()` 自身在读到 stock 后也调用守卫，确保 cron 或内部调用不绕过保护。

`DailySyncService.syncAll()` 的 select 加入 `subject_type`，并在循环前执行：

```ts
const equities = filterEquitySubjects(list)
const skippedMarkets = list.length - equities.length
let skipped = skippedMarkets
for (const stock of equities) {
  // 保留现有同步逻辑
}
```

`syncOne()` 查询 owner 时同时取 `subject_type` 并调用守卫；`getHistory()` 先校验标的所有权和类型，再查询日线。

- [ ] **Step 5: 运行后端测试和类型检查**

Run: `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/market-subject.test.ts server/src/stocks/trade-persistence.test.ts server/src/stocks/price-history.test.ts`

Expected: 全部 PASS。

Run: `pnpm --filter server build`

Expected: NestJS server build exit 0。

- [ ] **Step 6: 提交后端能力**

```bash
git add server/src/stocks/stock-subject.ts server/src/stocks/market-subject.persistence.ts server/src/stocks/market-subject.test.ts server/src/stocks/stocks.service.ts server/src/stocks/stocks.controller.ts server/src/stocks/daily-sync.service.ts server/src/ai/daily-brief.service.ts
git commit -m "feat: 支持创建唯一 A股大盘标的"
```

### Task 3: 让 Agent 进入市场研究模式

**Files:**
- Modify: `server/src/agent/agent.repository.ts`
- Modify: `server/src/agent/agent.types.ts`
- Modify: `server/src/agent/context/system-prompt.ts`
- Modify: `server/src/agent/context/agent-context.builder.ts`
- Modify: `server/src/agent/context/agent-context.test.ts`
- Modify: `server/src/agent/tools/stock-news.tool.ts`
- Modify: `server/src/agent/tools/tavily.test.ts`
- Modify: `server/src/agent/agent.module.ts`
- Modify: `server/src/agent/agent-orchestrator.ts`
- Modify: `server/src/agent/agent-orchestrator.test.ts`
- Modify: `server/src/agent/tools/local-tools.test.ts`

- [ ] **Step 1: 写市场提示词和工具筛选的失败测试**

在 `agent-context.test.ts` 增加：

```ts
test('market context uses a market prompt and removes equity-only tools', async () => {
  const deps = makeDeps()
  deps.stockIdentity = async () => ({
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subjectType: 'market' as const,
  })
  deps.repository.listMessages = async () => ({
    items: [makeMessage({ id: 'msg-current', role: 'user', content: '今天市场如何' })],
    nextCursor: null,
  })
  const context = await buildAgentContext({
    run,
    userId: 'user-1',
    stockId: 'market-1',
    threadId: 'thread-1',
    repository: deps.repository as never,
    stockIdentity: deps.stockIdentity,
    tools: [
      { name: 'get_stock_profile', description: '', parameters: {} },
      { name: 'get_price_history', description: '', parameters: {} },
      { name: 'get_daily_briefs', description: '', parameters: {} },
      { name: 'get_stock_notes', description: '', parameters: {} },
      { name: 'search_stock_news', description: '', parameters: {} },
    ],
  })
  assert.match(context.systemPrompt, /整个 A 股市场/)
  assert.match(context.systemPrompt, /市场宽度|行业轮动/)
  assert.doesNotMatch(context.systemPrompt, /仅服务一只已绑定股票/)
  assert.deepEqual(context.tools.map((tool) => tool.name), [
    'get_stock_profile',
    'get_stock_notes',
    'search_stock_news',
  ])
})
```

在 `tavily.test.ts` 增加：大盘身份执行 `search_stock_news` 后，传给 Tavily 的 query 为 `A股市场 <用户问题>`，不包含 `MARKET_A_SHARE`。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/context/agent-context.test.ts server/src/agent/tools/tavily.test.ts`

Expected: FAIL，提示身份类型不匹配或仍使用个股提示与内部代码。

- [ ] **Step 3: 扩展 Agent 身份并生成市场提示词**

在 `agent.types.ts` 定义统一 Agent 身份：

```ts
export interface AgentSubjectIdentity {
  code: string
  name: string
  subjectType: 'stock' | 'market'
}
```

在 `AgentRepository.getStockProfile()` SQL 中 select `subject_type`，并映射到 `subjectType`。`agent.module.ts` 两处 `stockIdentity` 和 `agent-orchestrator.ts` 的选项类型都传递该字段。

所有测试 fixture 中的普通股票身份同步补上 `subjectType: 'stock'`，避免依赖隐式默认值。

扩展 `SystemPromptInput` 并在 `buildSystemPrompt()` 中分支：

```ts
const identityLine = input.subjectType === 'market'
  ? '你是 A 股市场研究助手，当前研究对象是整个 A 股市场，不代表任何单一公司或具体指数。'
  : `你是股票研究助手，仅服务一只已绑定股票：${input.stockName}（${input.stockCode}）。`

const researchLine = input.subjectType === 'market'
  ? '【市场研究】优先分析指数表现、市场宽度、成交额、行业轮动、资金流向、风险偏好与市场情绪；不得套用公司基本面、个股估值、买卖价或止损价模板。'
  : '【个股研究】围绕当前股票的公司、行业、价格、观点与公开资料回答。'
```

保留现有引用、安全、不确定性和不执行交易规则。

- [ ] **Step 4: 筛选工具并修正大盘新闻检索**

在 `agent-context.builder.ts` 增加：

```ts
const MARKET_DISABLED_TOOLS = new Set(['get_price_history', 'get_daily_briefs'])

export function filterToolsForSubject(
  tools: AgentToolDefinition[],
  subjectType: 'stock' | 'market',
): AgentToolDefinition[] {
  return subjectType === 'market'
    ? tools.filter((tool) => !MARKET_DISABLED_TOOLS.has(tool.name))
    : tools
}
```

返回 context 时使用筛选后的 tools。`stock-news.tool.ts` 用：

```ts
const prefix = identity.subjectType === 'market'
  ? 'A股市场'
  : `${identity.code} ${identity.name}`
const composedQuery = `${prefix} ${input.query}`.trim()
```

`get_stock_profile` 保留，使 Agent 能知道当前名称与类型；大盘价格字段为 null，不构造伪数据。

- [ ] **Step 5: 运行 Agent 全量测试**

Run: `pnpm test:agent:all`

Expected: 全部 PASS。

- [ ] **Step 6: 提交 Agent 市场模式**

```bash
git add server/src/agent
git commit -m "feat: 增加 Agent 市场研究模式"
```

### Task 4: 增加前端标的类型与大盘添加入口

**Files:**
- Create: `src/stocks/subject.ts`
- Create: `src/stocks/subject.test.ts`
- Modify: `src/pages/stock-add/index.tsx`

- [ ] **Step 1: 写前端标的辅助逻辑失败测试**

`src/stocks/subject.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MARKET_SUBJECT_CODE,
  isMarketSubject,
  subjectMeta,
} from './subject'

test('recognizes and labels the fixed market subject', () => {
  const subject = { code: MARKET_SUBJECT_CODE, subject_type: 'market' as const }
  assert.equal(isMarketSubject(subject), true)
  assert.deepEqual(subjectMeta(subject), {
    isMarket: true,
    badge: '市场研究',
    displayCode: 'A股市场',
  })
})

test('keeps equity display values', () => {
  assert.deepEqual(subjectMeta({ code: '600519', subject_type: 'stock' }), {
    isMarket: false,
    badge: '',
    displayCode: '600519',
  })
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec tsx --test src/stocks/subject.test.ts`

Expected: FAIL，提示缺少 `./subject`。

- [ ] **Step 3: 实现共享前端标的逻辑**

`src/stocks/subject.ts`：

```ts
export type SubjectType = 'stock' | 'market'
export const MARKET_SUBJECT_CODE = 'MARKET_A_SHARE'

export interface ResearchSubject {
  code: string
  subject_type: SubjectType
}

export function isMarketSubject(subject: Pick<ResearchSubject, 'subject_type'>): boolean {
  return subject.subject_type === 'market'
}

export function subjectMeta(subject: ResearchSubject) {
  const isMarket = isMarketSubject(subject)
  return {
    isMarket,
    badge: isMarket ? '市场研究' : '',
    displayCode: isMarket ? 'A股市场' : subject.code,
  }
}
```

- [ ] **Step 4: 用现有 UI 组件增加固定大盘卡片**

在 `stock-add/index.tsx`：

- `ExistingStock` 增加 `subject_type`。
- 增加 `marketAdded` 与 `addingMarket` 状态。
- 初始 `/api/stocks` 解包后，用 `isMarketSubject` 判断是否已添加。
- 增加 `onAddMarket()`，调用 `Network.request({ url: '/api/stocks/market', method: 'POST' })`，成功后显示“已添加”。
- 在搜索框前插入 `Card`，内部使用 `CardContent`、`Button` 和 `Text`，文案严格为 spec 中的名称、标签和说明。
- 搜索提示改为“下方搜索仅支持沪深北已上市 A 股普通股票”。

核心按钮：

```tsx
<Button
  size="sm"
  disabled={marketAdded || addingMarket}
  variant={marketAdded ? 'secondary' : 'default'}
  onClick={onAddMarket}
>
  <Text className="block text-xs font-semibold">
    {marketAdded ? '已添加' : addingMarket ? '添加中' : '添加大盘'}
  </Text>
</Button>
```

- [ ] **Step 5: 运行测试、lint 和类型检查**

Run: `pnpm exec tsx --test src/stocks/subject.test.ts && pnpm validate`

Expected: 测试 PASS，lint 和 TypeScript exit 0。

- [ ] **Step 6: 提交添加入口**

```bash
git add src/stocks src/pages/stock-add/index.tsx
git commit -m "feat: 增加 A股大盘添加入口"
```

### Task 5: 实现大盘详情请求分流与市场版页面

**Files:**
- Create: `src/pages/stock/stock-detail-logic.ts`
- Create: `src/pages/stock/stock-detail-logic.test.ts`
- Modify: `src/pages/stock/index.tsx`

- [ ] **Step 1: 写详情模式失败测试**

`stock-detail-logic.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStockDetailMode } from './stock-detail-logic'

test('market mode loads research content without equity endpoints', () => {
  assert.deepEqual(buildStockDetailMode('market', 'market-1'), {
    requests: [
      '/api/notes?stock_id=market-1&limit=100',
      '/api/notes/summary/market-1',
      '/api/notes/distribution/market-1',
    ],
    showMarketBadge: true,
    showPrice: false,
    showTrading: false,
    showDailyBrief: false,
    showPriceSummary: false,
  })
})

test('stock mode preserves all current equity capabilities', () => {
  const mode = buildStockDetailMode('stock', 'stock-1')
  assert.equal(mode.showPrice, true)
  assert.equal(mode.showTrading, true)
  assert.equal(mode.showDailyBrief, true)
  assert.equal(mode.showPriceSummary, true)
  assert.ok(mode.requests.includes('/api/stocks/stock-1/stop-loss-alert'))
  assert.ok(mode.requests.includes('/api/stocks/stock-1/brief?days=7'))
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm exec tsx --test src/pages/stock/stock-detail-logic.test.ts`

Expected: FAIL，提示缺少 `stock-detail-logic`。

- [ ] **Step 3: 实现详情模式配置**

`stock-detail-logic.ts`：

```ts
import type { SubjectType } from '@/stocks/subject'

export function buildStockDetailMode(subjectType: SubjectType, stockId: string) {
  const researchRequests = [
    `/api/notes?stock_id=${stockId}&limit=100`,
    `/api/notes/summary/${stockId}`,
    `/api/notes/distribution/${stockId}`,
  ]
  const isMarket = subjectType === 'market'
  return {
    requests: isMarket
      ? researchRequests
      : [
          ...researchRequests,
          `/api/stocks/${stockId}/stop-loss-alert`,
          `/api/stocks/${stockId}/brief?days=7`,
        ],
    showMarketBadge: isMarket,
    showPrice: !isMarket,
    showTrading: !isMarket,
    showDailyBrief: !isMarket,
    showPriceSummary: !isMarket,
  }
}
```

- [ ] **Step 4: 重构详情加载顺序并条件渲染**

在 `stock/index.tsx` 的 `Stock` 类型加入 `subject_type: SubjectType`。`load(sid)` 先单独请求 `/api/stocks/${sid}`，得到标的后构建 mode，再并行请求 mode 允许的笔记、统计、止损与简评。Agent 报告仍对两种模式加载。

`useLoad` 的静默价格刷新只在取得的标的为 `stock` 后执行；不要在路由加载阶段无条件调用 `refresh.sync()`。

页面按 mode：

- 大盘 Hero 使用 `Card`/`CardContent` 展示标题、市场研究标签和说明。
- 两种模式都保留“问 AI”“新增观点”“上传文档”、观点列表、方向分布和 Agent 报告。
- `showPrice` 包裹价格、时间、刷新、OHLCV。
- `showTrading` 包裹观察/持有、买卖、止损。
- `showDailyBrief` 包裹个股简评。
- `showPriceSummary` 包裹入场/目标/止损均价卡。

市场模式的主操作使用现有 UI 组件：

```tsx
<Button onClick={openAgent}>
  <Sparkles size={14} color="#ffffff" />
  <Text className="block text-xs font-semibold text-white">问 AI</Text>
</Button>
```

- [ ] **Step 5: 运行详情测试和前端校验**

Run: `pnpm exec tsx --test src/pages/stock/stock-detail-logic.test.ts src/stocks/subject.test.ts && pnpm validate`

Expected: 测试 PASS，lint 和 TypeScript exit 0。

- [ ] **Step 6: 提交详情模式**

```bash
git add src/pages/stock src/stocks/subject.ts
git commit -m "feat: 增加大盘研究详情模式"
```

### Task 6: 打通列表、资料库和笔记编辑并完成回归

**Files:**
- Modify: `src/pages/index/index.tsx`
- Modify: `src/pages/library/index.tsx`
- Modify: `src/pages/profile/index.tsx`
- Modify: `src/pages/stock-search/index.tsx`
- Modify: `src/pages/note-edit/index.tsx`
- Modify: `src/pages/note-edit/note-editor-logic.test.ts`

- [ ] **Step 1: 写笔记选择展示的失败测试**

在 `note-editor-logic.test.ts` 增加，并在 `note-editor-logic.ts` 导出对应函数：

```ts
test('labels market and stock research targets without exposing the internal market code', () => {
  assert.equal(formatResearchSubjectOption({
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subject_type: 'market',
  }), 'A股大盘 · 市场研究')
  assert.equal(formatResearchSubjectOption({
    code: '600519',
    name: '贵州茅台',
    subject_type: 'stock',
  }), '贵州茅台 · 600519')
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `pnpm test:note-editor`

Expected: FAIL，提示 `formatResearchSubjectOption` 未定义或未导出。

- [ ] **Step 3: 实现跨页面标的展示**

`formatResearchSubjectOption()` 使用 `subjectMeta()` 返回显示代码。所有相关页面的 `Stock`/`StockOption` 类型加入 `subject_type: SubjectType`。

- 首页：大盘卡显示“市场研究”标签，只展示说明或笔记入口，不展示“未刷新”、价格时间、持仓和止损。
- 资料库：搜索提示改为“搜索研究对象 / 观点”，筛选项“全部股票”改为“全部标的”，大盘项显示“大盘”标签。
- 个人页：统计和管理文案改为“自选标的”，大盘项不展示内部代码，删除流程保持原样。
- 搜索页：股票模式标题改为“标的”，大盘项显示“市场研究”，仍进入统一详情页。
- 笔记编辑：`StockOption` 增加 `subject_type`；“关联股票”改为“关联研究对象”；Select 选项调用 `formatResearchSubjectOption()`；空态改为“请先添加一个自选标的”；保存缺失提示改为“请选择关联研究对象”。

页面通用标签使用已有 `Badge`：

```tsx
{isMarketSubject(subject) ? <Badge variant="secondary">市场研究</Badge> : null}
```

如果当前 `Badge` API 不支持该 variant，使用组件已定义的合法 variant，不在页面用 `View/Text` 重新手搓 Badge。

- [ ] **Step 4: 运行功能相关测试**

Run: `pnpm exec tsx --test src/stocks/subject.test.ts src/pages/stock/stock-detail-logic.test.ts src/pages/note-edit/note-editor-logic.test.ts server/src/stocks/market-subject.test.ts`

Expected: 全部 PASS。

Run: `pnpm test:agent:all && pnpm test:note-editor && pnpm test:prelaunch`

Expected: 全部 PASS。

- [ ] **Step 5: 执行跨端构建与静态校验**

Run: `pnpm validate && pnpm build:web && pnpm build:weapp && pnpm build:server && git diff --check`

Expected: 所有命令 exit 0，无 lint、类型、构建或空白错误。

- [ ] **Step 6: 手工验收关键路径**

启动：`pnpm dev`

按顺序验证：添加大盘一次、重复添加、首页入口、大盘详情无个股功能、新建观点、上传文档、创建 AI 会话、资料库筛选、删除后重新添加、普通股票行情和 AI 回归。H5 与微信开发者工具各验证一次。

- [ ] **Step 7: 提交完整前端接入**

```bash
git add src/pages/index/index.tsx src/pages/library/index.tsx src/pages/profile/index.tsx src/pages/stock-search/index.tsx src/pages/note-edit/index.tsx src/pages/note-edit/note-editor-logic.ts src/pages/note-edit/note-editor-logic.test.ts
git commit -m "feat: 打通大盘研究标的使用链路"
```

## 完成定义

- 每个用户只能添加一个固定「A股大盘」。
- 大盘可承载笔记、文档、AI 会话和报告。
- 前后端均不会对大盘触发行情、持仓、止损或个股简评。
- Agent 明确进入市场研究模式并隐藏个股行情工具。
- H5、小程序、服务端构建及相关自动化测试全部通过。
