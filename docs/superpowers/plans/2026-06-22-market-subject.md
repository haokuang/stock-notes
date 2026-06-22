# A股大盘研究标的 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许每个用户添加唯一的「A股大盘」研究标的，并围绕它写笔记、上传文档和咨询 AI，同时隔离所有个股行情与交易能力。

**Architecture:** 在现有 `stocks` 聚合根上增加 `subject_type`，用固定代码 `MARKET_A_SHARE` 表示市场研究对象，继续复用笔记和 Agent 外键。后端通过类型守卫阻止大盘进入行情、交易和个股简评链路；前端通过纯逻辑模块驱动添加状态、详情请求分流和条件渲染；Agent 上下文按标的类型切换提示词、搜索词和可用工具。

**Tech Stack:** NestJS、Drizzle ORM、PostgreSQL、Taro React、TypeScript、Tailwind CSS、`@/components/ui`、Node.js test runner、pnpm

---

## File map

- Create `server/migrations/0012_market_subject.sql`: 增加并约束 `stocks.subject_type`。
- Create `server/src/stocks/stock-subject.ts`: 后端统一的标的类型、固定大盘身份和能力守卫。
- Create `server/src/stocks/stock-subject.test.ts`: 固定身份、守卫和迁移契约测试。
- Modify `server/src/storage/database/shared/schema.ts`: Drizzle 字段声明。
- Modify `server/src/stocks/stocks.service.ts`: 创建大盘、普通股票显式写入类型、个股能力保护。
- Modify `server/src/stocks/stocks.controller.ts`: 暴露 `POST /stocks/market`，委托详情外的个股操作前置校验。
- Modify `server/src/stocks/daily-sync.service.ts`: 批量同步跳过大盘，单项同步和历史查询拒绝大盘。
- Modify `server/src/ai/daily-brief.service.ts`: 生成和读取个股简评时拒绝大盘。
- Modify `server/src/agent/agent.repository.ts`: Agent 画像返回 `subjectType`。
- Modify `server/src/agent/context/agent-context.builder.ts`: 向系统提示传入类型并过滤个股工具。
- Modify `server/src/agent/context/system-prompt.ts`: 生成市场研究模式提示词。
- Modify `server/src/agent/tools/stock-news.tool.ts`: 大盘模式使用“A股市场”搜索语义。
- Modify `server/src/agent/agent.module.ts`, `server/src/agent/agent-orchestrator.ts`: 统一传递带类型的标的身份。
- Modify Agent tests under `server/src/agent/**`: 覆盖身份投影、提示词、工具和搜索词。
- Create `src/stocks/subject.ts`: 前端标的类型、类型判断和显示元数据。
- Create `src/stocks/subject.test.ts`: 前端类型逻辑测试。
- Create `src/pages/stock/stock-detail-logic.ts`: 详情请求分流与可见能力模型。
- Create `src/pages/stock/stock-detail-logic.test.ts`: 大盘与个股详情模式测试。
- Modify `src/pages/stock-add/index.tsx`: 固定大盘卡片和添加动作。
- Modify `src/pages/stock/index.tsx`: 先加载标的，再按类型请求和渲染。
- Modify `src/pages/index/index.tsx`, `src/pages/library/index.tsx`, `src/pages/profile/index.tsx`, `src/pages/stock-search/index.tsx`, `src/pages/note-edit/index.tsx`: 标签与“研究标的”文案兼容。

### Task 1: Add the subject type contract and database migration

**Files:**
- Create: `server/migrations/0012_market_subject.sql`
- Create: `server/src/stocks/stock-subject.ts`
- Create: `server/src/stocks/stock-subject.test.ts`
- Modify: `server/src/storage/database/shared/schema.ts`

- [ ] **Step 1: Write the failing migration and domain contract tests**

Create `server/src/stocks/stock-subject.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MARKET_SUBJECT,
  assertEquitySubject,
  isMarketSubject,
} from './stock-subject'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0012_market_subject.sql'),
  'utf8',
)

test('migration adds a stock-compatible subject type constraint', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS subject_type/)
  assert.match(migration, /DEFAULT 'stock'/)
  assert.match(migration, /CHECK \(subject_type IN \('stock', 'market'\)\)/)
})

test('defines one immutable A-share market identity', () => {
  assert.deepEqual(MARKET_SUBJECT, {
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subjectType: 'market',
  })
  assert.equal(isMarketSubject({ subject_type: 'market' }), true)
  assert.equal(isMarketSubject({ subject_type: 'stock' }), false)
})

test('rejects equity-only operations for a market subject', () => {
  assert.throws(
    () => assertEquitySubject({ subject_type: 'market' }),
    /大盘标的不支持此操作/,
  )
  assert.doesNotThrow(() => assertEquitySubject({ subject_type: 'stock' }))
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/stock-subject.test.ts
```

Expected: FAIL because `stock-subject.ts` and `0012_market_subject.sql` do not exist.

- [ ] **Step 3: Implement the migration and subject contract**

Create `server/migrations/0012_market_subject.sql`:

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

CREATE INDEX IF NOT EXISTS stocks_subject_type_idx
  ON stocks(subject_type);
```

Create `server/src/stocks/stock-subject.ts`:

```ts
import { BadRequestException } from '@nestjs/common'

export type StockSubjectType = 'stock' | 'market'

export const MARKET_SUBJECT = Object.freeze({
  code: 'MARKET_A_SHARE',
  name: 'A股大盘',
  subjectType: 'market' as const,
})

export interface SubjectTypeRow {
  subject_type?: StockSubjectType | null
}

export function isMarketSubject(row: SubjectTypeRow): boolean {
  return row.subject_type === 'market'
}

export function assertEquitySubject(row: SubjectTypeRow): void {
  if (isMarketSubject(row)) {
    throw new BadRequestException('大盘标的不支持此操作')
  }
}
```

Add this field to the `stocks` Drizzle table in `server/src/storage/database/shared/schema.ts` immediately after `name`:

```ts
subject_type: varchar('subject_type', { length: 10 }).default('stock').notNull(),
```

Add this index beside the existing stock indexes:

```ts
index('stocks_subject_type_idx').on(table.subject_type),
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the model contract**

```bash
git add server/migrations/0012_market_subject.sql server/src/stocks/stock-subject.ts server/src/stocks/stock-subject.test.ts server/src/storage/database/shared/schema.ts
git commit -m "feat: 增加市场研究标的类型"
```

### Task 2: Create the unique market subject and protect equity-only APIs

**Files:**
- Create: `server/src/stocks/market-subject.service.test.ts`
- Modify: `server/src/stocks/stocks.service.ts`
- Modify: `server/src/stocks/stocks.controller.ts`
- Modify: `server/src/stocks/daily-sync.service.ts`
- Modify: `server/src/ai/daily-brief.service.ts`

- [ ] **Step 1: Write failing service behavior tests**

Create `server/src/stocks/market-subject.service.test.ts` with a small Drizzle-chain fake that records inserts and returns configured rows:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { StocksService } from './stocks.service'
import { MARKET_SUBJECT } from './stock-subject'

function makeDb(options: { existing?: boolean; duplicateOnInsert?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = []
  return {
    inserted,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => options.existing ? [{ id: 'market-1' }] : [],
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value)
        return {
          returning: async () => {
            if (options.duplicateOnInsert) throw Object.assign(new Error('duplicate'), { code: '23505' })
            return [{ id: 'market-1', ...value }]
          },
        }
      },
    }),
  }
}

function makeService(db: ReturnType<typeof makeDb>) {
  return new StocksService(
    db as never,
    { connect: async () => ({ release() {} }) } as never,
    { getListedOrdinaryStock: async () => null } as never,
  )
}

test('creates the fixed market subject without requesting market data', async () => {
  const db = makeDb()
  const created = await makeService(db).createMarket('user-1')
  assert.equal(created.code, MARKET_SUBJECT.code)
  assert.equal(created.name, MARKET_SUBJECT.name)
  assert.equal(created.subject_type, 'market')
  assert.deepEqual(db.inserted[0], {
    user_id: 'user-1',
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subject_type: 'market',
    industry: null,
    status: 'watching',
    sort_order: 0,
  })
})

test('maps both an existing row and a concurrent unique violation to one conflict', async () => {
  await assert.rejects(() => makeService(makeDb({ existing: true })).createMarket('user-1'), /市场大盘已在自选中/)
  await assert.rejects(() => makeService(makeDb({ duplicateOnInsert: true })).createMarket('user-1'), /市场大盘已在自选中/)
})
```

Extend `server/src/stocks/stock-subject.test.ts` with controller/source contracts for guarded endpoints:

```ts
test('controller exposes a dedicated market endpoint with HTTP 200 semantics', () => {
  const source = readFileSync(path.resolve(__dirname, './stocks.controller.ts'), 'utf8')
  assert.match(source, /@Post\('market'\)[\s\S]*@HttpCode\(200\)[\s\S]*createMarket/)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/stock-subject.test.ts server/src/stocks/market-subject.service.test.ts
```

Expected: FAIL because `createMarket` and the controller route are absent.

- [ ] **Step 3: Implement market creation and direct stock-operation guards**

In `StocksService`, import `MARKET_SUBJECT`, `assertEquitySubject`, and add:

```ts
async createMarket(uid: string) {
  const existing = await this.db
    .select({ id: schema.stocks.id })
    .from(schema.stocks)
    .where(and(eq(schema.stocks.user_id, uid), eq(schema.stocks.code, MARKET_SUBJECT.code)))
    .limit(1)
  if (existing.length) throw new ConflictException('市场大盘已在自选中')

  try {
    const [row] = await this.db.insert(schema.stocks).values({
      user_id: uid,
      code: MARKET_SUBJECT.code,
      name: MARKET_SUBJECT.name,
      subject_type: MARKET_SUBJECT.subjectType,
      industry: null,
      status: 'watching',
      sort_order: 0,
    }).returning()
    return row
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ConflictException('市场大盘已在自选中')
    }
    throw error
  }
}

async assertEquityOperation(uid: string, stockId: string) {
  const stock = await this.getById(uid, stockId)
  assertEquitySubject(stock)
  return stock
}
```

Set `subject_type: 'stock'` explicitly in `create` after the Tushare lookup. Call `assertEquitySubject(stock)` immediately after ownership lookup in `refreshPrice`, `buy`, `sell`, and `getStopLossAlert`. Change `getRefreshStatus` to await `assertEquityOperation` before returning cooldown state.

In `StocksController`, place this route before `@Get(':id')`:

```ts
@Post('market')
@HttpCode(200)
async createMarket(@CurrentUser() user: { id: string }) {
  const data = await this.service.createMarket(user.id)
  return { data }
}
```

Before delegating `history`, `generateBrief`, and `recentBriefs`, call:

```ts
await this.service.assertEquityOperation(user.id, id)
```

- [ ] **Step 4: Make sync and brief services type-safe**

In `DailySyncService.syncAll`, select `subject_type` and skip market rows before converting codes:

```ts
if (s.subject_type === 'market') {
  skipped++
  continue
}
```

In `syncOne`, select `subject_type`, call `assertEquitySubject(owner)`, and preserve the existing `error` return only for missing ownership. In `getHistory`, query the owned stock first and call the same guard before reading prices.

In `DailyBriefService.generateBrief`, call `assertEquitySubject(stock)` immediately after the not-found check. In `getRecent`, query the owned stock, reject missing ownership, call the guard, then read `stockBriefs`.

- [ ] **Step 5: Run focused and existing stock tests**

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/stock-subject.test.ts server/src/stocks/market-subject.service.test.ts server/src/stocks/trade-persistence.test.ts server/src/stocks/price-history.test.ts server/src/ai/daily-brief-persistence.test.ts
```

Expected: all tests pass. If the existing transaction helpers can be reached without `StocksService`, retain their tests unchanged; the service-level guard is the API boundary.

- [ ] **Step 6: Commit backend behavior**

```bash
git add server/src/stocks server/src/ai/daily-brief.service.ts
git commit -m "feat: 支持添加唯一市场大盘"
```

### Task 3: Make Agent context market-aware

**Files:**
- Modify: `server/src/agent/agent.repository.ts`
- Modify: `server/src/agent/context/agent-context.builder.ts`
- Modify: `server/src/agent/context/system-prompt.ts`
- Modify: `server/src/agent/context/agent-context.test.ts`
- Modify: `server/src/agent/tools/stock-news.tool.ts`
- Modify: `server/src/agent/tools/tavily.test.ts`
- Modify: `server/src/agent/tools/local-tools.test.ts`
- Modify: `server/src/agent/agent.module.ts`
- Modify: `server/src/agent/agent-orchestrator.ts`

- [ ] **Step 1: Write failing market-context tests**

Add to `server/src/agent/context/agent-context.test.ts`:

```ts
test('market context uses market language and removes equity-only tools', async () => {
  const deps = makeDeps()
  deps.repository.listMessages = async () => ({
    items: [makeMessage({ id: 'msg-current', role: 'user', content: '今天情绪如何' })],
    nextCursor: null,
  })
  const context = await buildAgentContext({
    run,
    userId: 'user-1',
    stockId: 'market-1',
    threadId: 'thread-1',
    repository: deps.repository as never,
    stockIdentity: async () => ({ code: 'MARKET_A_SHARE', name: 'A股大盘', subjectType: 'market' }),
    tools: [
      { name: 'get_stock_profile', description: '', parameters: {} },
      { name: 'get_price_history', description: '', parameters: {} },
      { name: 'get_daily_briefs', description: '', parameters: {} },
      { name: 'get_stock_notes', description: '', parameters: {} },
      { name: 'search_stock_news', description: '', parameters: {} },
    ],
  })
  assert.match(context.systemPrompt, /整个 A 股市场/)
  assert.match(context.systemPrompt, /市场宽度|行业轮动|成交额/)
  assert.doesNotMatch(context.systemPrompt, /仅服务一只/)
  assert.deepEqual(context.tools.map((tool) => tool.name), [
    'get_stock_profile',
    'get_stock_notes',
    'search_stock_news',
  ])
})
```

Add these imports to `server/src/agent/tools/tavily.test.ts`:

```ts
import { createStockNewsTool, type StockNewsToolResult } from './stock-news.tool'
```

Then add this test, reusing the file's existing `makeFetch` helper:

```ts
test('market news search uses A-share market semantics without the internal code', async () => {
  const fetchStub = makeFetch([{
    status: 200,
    body: {
      query: 'A股市场 今日资金和情绪',
      results: [{
        title: '市场复盘',
        url: 'https://market.test/review',
        content: '行业轮动',
        published_date: '2026-06-22',
      }],
    },
  }])
  const client = new TavilyClient({ apiKey: 'k', fetchImpl: fetchStub.fn })
  const tool = createStockNewsTool({
    tavily: client,
    stockIdentity: async () => ({ code: 'MARKET_A_SHARE', name: 'A股大盘', subjectType: 'market' }),
  })
  const result = await tool.execute({
    userId: 'user-1',
    stockId: 'market-1',
    threadId: 'thread-1',
    runId: 'run-1',
    signal: new AbortController().signal,
  }, { query: '今日资金和情绪' }) as StockNewsToolResult
  assert.match(result.query, /^A股市场 今日资金和情绪$/)
  assert.doesNotMatch(result.query, /MARKET_A_SHARE/)
})
```

- [ ] **Step 2: Run Agent tests and verify RED**

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/context/agent-context.test.ts server/src/agent/tools/tavily.test.ts server/src/agent/tools/local-tools.test.ts
```

Expected: FAIL because identities do not expose `subjectType`, prompt is stock-only, and tools are not filtered.

- [ ] **Step 3: Extend repository identity and system prompt**

In `AgentRepository.getStockProfile`, select `subject_type`; add it to row and result types and map it as:

```ts
subjectType: row.subject_type === 'market' ? 'market' : 'stock',
```

Extend `SystemPromptInput` with `subjectType: 'stock' | 'market'`. Implement `buildSystemPrompt` with this first line and market guidance:

```ts
const identityLine = input.subjectType === 'market'
  ? '你是 A 股市场研究助手，当前研究对象是整个 A 股市场，不代表任何单一公司或具体指数。'
  : `你是股票研究助手，仅服务一只已绑定股票：${input.stockName}（${input.stockCode}）。`

const researchLine = input.subjectType === 'market'
  ? '【研究框架】优先分析指数表现、市场宽度、成交额、行业轮动、资金流向、风险偏好和市场情绪；不得套用公司基本面、个股估值、买卖价或止损价模板。'
  : '【研究框架】围绕当前股票的公司、行业、价格、用户笔记和公开资料进行分析。'
```

Return these two lines together with the existing scope, citation, external-content, uncertainty and no-trading rules.

- [ ] **Step 4: Filter tools and compose the correct search query**

Define in `agent-context.builder.ts`:

```ts
const MARKET_UNSUPPORTED_TOOLS = new Set(['get_price_history', 'get_daily_briefs'])

function toolsForSubject(tools: AgentToolDefinition[], subjectType: 'stock' | 'market') {
  return subjectType === 'market'
    ? tools.filter((tool) => !MARKET_UNSUPPORTED_TOOLS.has(tool.name))
    : tools
}
```

Pass `subjectType` into `buildSystemPrompt`, return the filtered list, and update all identity function types to:

```ts
{ code: string; name: string; subjectType: 'stock' | 'market' }
```

In `stock-news.tool.ts`, build the query as:

```ts
const prefix = subjectType === 'market' ? 'A股市场' : `${code} ${name}`
const composedQuery = `${prefix} ${input.query}`.trim()
```

Update both `stockIdentity` factories in `agent.module.ts` and the `AgentOrchestratorOptions` signature to pass `profile.subjectType`.

Update stock identity fixtures in `agent-context.test.ts`, `agent-orchestrator.test.ts`, and `provider-switching.test.ts` to return the new field:

```ts
function makeStockIdentity() {
  return async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const })
}
```

- [ ] **Step 5: Verify Agent regression**

```bash
pnpm test:agent:batch3 && pnpm test:agent:batch4
```

Expected: all Agent context, tool, orchestrator, worker and runtime tests pass.

- [ ] **Step 6: Commit Agent behavior**

```bash
git add server/src/agent
git commit -m "feat: 增加大盘 AI 研究模式"
```

### Task 4: Add frontend subject primitives and the market card

**Files:**
- Create: `src/stocks/subject.ts`
- Create: `src/stocks/subject.test.ts`
- Modify: `src/pages/stock-add/index.tsx`

- [ ] **Step 1: Write failing frontend subject tests**

Create `src/stocks/subject.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { MARKET_SUBJECT_META, isMarketSubject, subjectSecondaryText } from './subject'

test('recognizes and labels the fixed market subject', () => {
  const market = { code: 'MARKET_A_SHARE', name: 'A股大盘', subject_type: 'market' as const }
  assert.equal(isMarketSubject(market), true)
  assert.equal(MARKET_SUBJECT_META.label, '市场研究')
  assert.equal(subjectSecondaryText(market), '市场研究')
})

test('keeps stock secondary information', () => {
  assert.equal(subjectSecondaryText({ code: '600519', name: '贵州茅台', subject_type: 'stock', industry: '白酒' }), '600519 · 白酒')
})
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec tsx --test src/stocks/subject.test.ts
```

Expected: FAIL because `src/stocks/subject.ts` does not exist.

- [ ] **Step 3: Implement the frontend subject module**

Create `src/stocks/subject.ts`:

```ts
export type SubjectType = 'stock' | 'market'

export interface ResearchSubject {
  id?: string
  code: string
  name: string
  subject_type: SubjectType
  industry?: string | null
}

export const MARKET_SUBJECT_META = Object.freeze({
  code: 'MARKET_A_SHARE',
  name: 'A股大盘',
  label: '市场研究',
})

export function isMarketSubject(subject: Pick<ResearchSubject, 'subject_type'>): boolean {
  return subject.subject_type === 'market'
}

export function subjectSecondaryText(subject: ResearchSubject): string {
  if (isMarketSubject(subject)) return MARKET_SUBJECT_META.label
  return [subject.code, subject.industry].filter(Boolean).join(' · ')
}
```

- [ ] **Step 4: Add the market card using existing UI components**

In `src/pages/stock-add/index.tsx`, extend `ExistingStock` with `subject_type`, derive:

```ts
const marketAdded = existingSubjects.some((subject) => subject.subject_type === 'market')
```

Use component state rather than a separate network source of truth. Add this action:

```ts
const onAddMarket = async () => {
  if (adding || marketAdded) return
  setAdding(MARKET_SUBJECT_META.code)
  try {
    await Network.request({ url: '/api/stocks/market', method: 'POST' })
    setExistingSubjects((current) => [...current, {
      code: MARKET_SUBJECT_META.code,
      subject_type: 'market',
    }])
    Taro.showToast({ title: '已添加', icon: 'success' })
  } catch (error: any) {
    Taro.showToast({ title: error?.data?.message ?? error?.data?.msg ?? '添加失败', icon: 'none' })
  } finally {
    setAdding(null)
  }
}
```

Import `Badge` from `@/components/ui/badge`. Render a `Card` before the stock search input. Its `CardContent` contains title「A股大盘」、`<Badge variant="secondary">市场研究</Badge>`、description「记录市场观点，与 AI 讨论指数、行业轮动、资金与情绪」and a `Button` labelled `添加大盘` or `已添加`. Continue using `Button`, `Badge`, `Card`, and `Input` from `@/components/ui`; do not create a `View`-styled button or badge.

Change the stock-only hint to「下方搜索仅支持沪深北已上市 A 股普通股票」and the empty prompt to「输入 6 位股票代码或中文名称搜索个股」。

- [ ] **Step 5: Verify frontend primitives and type checking**

```bash
pnpm exec tsx --test src/stocks/subject.test.ts && pnpm validate
```

Expected: subject tests pass and lint/typecheck exit 0.

- [ ] **Step 6: Commit the add flow**

```bash
git add src/stocks/subject.ts src/stocks/subject.test.ts src/pages/stock-add/index.tsx
git commit -m "feat: 增加大盘自选入口"
```

### Task 5: Split stock detail loading and rendering by subject type

**Files:**
- Create: `src/pages/stock/stock-detail-logic.ts`
- Create: `src/pages/stock/stock-detail-logic.test.ts`
- Modify: `src/pages/stock/index.tsx`

- [ ] **Step 1: Write failing detail-mode tests**

Create `src/pages/stock/stock-detail-logic.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { detailCapabilities, detailRequestUrls } from './stock-detail-logic'

test('market detail loads research content without equity endpoints', () => {
  assert.deepEqual(detailRequestUrls('market', 'market-1'), [
    '/api/notes?stock_id=market-1&limit=100',
    '/api/notes/summary/market-1',
    '/api/notes/distribution/market-1',
  ])
  assert.deepEqual(detailCapabilities('market'), {
    price: false,
    trading: false,
    brief: false,
    notes: true,
    agent: true,
  })
})

test('stock detail preserves all existing endpoints and capabilities', () => {
  assert.deepEqual(detailRequestUrls('stock', 'stock-1'), [
    '/api/notes?stock_id=stock-1&limit=100',
    '/api/notes/summary/stock-1',
    '/api/notes/distribution/stock-1',
    '/api/stocks/stock-1/stop-loss-alert',
    '/api/stocks/stock-1/brief?days=7',
  ])
  assert.equal(detailCapabilities('stock').price, true)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec tsx --test src/pages/stock/stock-detail-logic.test.ts
```

Expected: FAIL because the logic module does not exist.

- [ ] **Step 3: Implement the detail-mode model**

Create `src/pages/stock/stock-detail-logic.ts`:

```ts
import type { SubjectType } from '@/stocks/subject'

export function detailRequestUrls(subjectType: SubjectType, stockId: string): string[] {
  const common = [
    `/api/notes?stock_id=${stockId}&limit=100`,
    `/api/notes/summary/${stockId}`,
    `/api/notes/distribution/${stockId}`,
  ]
  return subjectType === 'market'
    ? common
    : [...common, `/api/stocks/${stockId}/stop-loss-alert`, `/api/stocks/${stockId}/brief?days=7`]
}

export function detailCapabilities(subjectType: SubjectType) {
  const equity = subjectType === 'stock'
  return { price: equity, trading: equity, brief: equity, notes: true, agent: true }
}
```

- [ ] **Step 4: Refactor detail loading without changing stock behavior**

In `src/pages/stock/index.tsx`:

1. Extend `Stock` with `subject_type: SubjectType`.
2. Replace the initial six-request `Promise.all` with one detail request first:

```ts
const sRes = await Network.request<{ data: Stock }>({ url: `/api/stocks/${sid}` })
const loadedStock = sRes.data?.data
if (!loadedStock) return
setStock(loadedStock)
const urls = detailRequestUrls(loadedStock.subject_type, sid)
const responses = await Promise.all(urls.map((url) => Network.request({ url })))
```

3. Assign the first three common responses to notes, summary and distribution. Only assign stop-loss and brief responses when `subject_type === 'stock'`; otherwise reset `stopLoss` to `null` and `briefs` to `[]`.
4. Keep `getAgentApi().listReports(sid)` for both types.
5. In `useLoad`, call silent `refresh.sync` only after `load` resolves to a stock subject. Make `load` return the loaded `Stock | null` so this decision uses fresh data rather than React state.

- [ ] **Step 5: Gate equity UI and present the market research header**

Derive:

```ts
const capabilities = detailCapabilities(stock?.subject_type ?? 'stock')
const marketMode = stock?.subject_type === 'market'
```

For market mode, render a compact `Card` containing「A股大盘」「市场研究」and the existing `Button` entry for `openAgent`. Keep the existing “新增观点”和“上传文档” buttons. Wrap price hero, refresh, daily brief, holding state, stop-loss, OHLCV and price-stat cards in the matching `capabilities.price`, `capabilities.trading`, or `capabilities.brief` conditions. Keep notes, direction distribution and Agent reports visible.

Set the navigation title to `marketMode ? '大盘研究' : '股票详情'` after the detail response is known.

- [ ] **Step 6: Verify detail behavior**

```bash
pnpm exec tsx --test src/pages/stock/stock-detail-logic.test.ts && pnpm validate
```

Expected: both detail tests pass and validation exits 0.

- [ ] **Step 7: Commit detail mode**

```bash
git add src/pages/stock/stock-detail-logic.ts src/pages/stock/stock-detail-logic.test.ts src/pages/stock/index.tsx
git commit -m "feat: 增加大盘研究详情模式"
```

### Task 6: Propagate research-subject labels through the product

**Files:**
- Modify: `src/pages/index/index.tsx`
- Modify: `src/pages/library/index.tsx`
- Modify: `src/pages/profile/index.tsx`
- Modify: `src/pages/stock-search/index.tsx`
- Modify: `src/pages/note-edit/index.tsx`
- Modify: `src/pages/note-edit/note-editor-logic.test.ts`

- [ ] **Step 1: Add a failing note-editor display test**

Extend `src/pages/note-edit/note-editor-logic.ts` with a planned helper import in the test first, then add this test to `note-editor-logic.test.ts`:

```ts
import { formatResearchSubjectOption } from './note-editor-logic'

test('formats stock and market choices as research subjects', () => {
  assert.equal(formatResearchSubjectOption({ name: 'A股大盘', code: 'MARKET_A_SHARE', subject_type: 'market' }), 'A股大盘 · 市场研究')
  assert.equal(formatResearchSubjectOption({ name: '贵州茅台', code: '600519', subject_type: 'stock' }), '贵州茅台 · 600519')
})
```

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec tsx --test src/pages/note-edit/note-editor-logic.test.ts
```

Expected: FAIL because `formatResearchSubjectOption` is absent.

- [ ] **Step 3: Implement the shared display behavior**

Add to `note-editor-logic.ts`:

```ts
export function formatResearchSubjectOption(subject: {
  name: string
  code: string
  subject_type: 'stock' | 'market'
}): string {
  return subject.subject_type === 'market'
    ? `${subject.name} · 市场研究`
    : `${subject.name} · ${subject.code}`
}
```

Extend all local `Stock`/`StockOption` interfaces in the five pages with `subject_type: 'stock' | 'market'` and use `isMarketSubject`, `subjectSecondaryText`, or `formatResearchSubjectOption` instead of rendering the fixed internal code. Wherever a visible「市场研究」标签 is required, import and use `Badge` from `@/components/ui/badge`; do not reproduce a badge with styled `View`/`Text`.

- [ ] **Step 4: Update each page with explicit product wording**

Apply these exact behaviors:

- `index/index.tsx`: market card shows「市场研究」and no price, time, holding or stop-loss UI; stock cards remain unchanged.
- `library/index.tsx`: search hint becomes「搜索研究标的或观点」and filter label becomes「全部标的」; market filter item displays its normal name.
- `profile/index.tsx`: summary caption becomes「自选标的」, section becomes「管理自选」, empty text becomes「还没有添加研究标的」, shortcut becomes「添加标的」; market row secondary text is「市场研究」。
- `stock-search/index.tsx`: stock result interface gains `subject_type`; market result secondary text never exposes `MARKET_A_SHARE` and shows「市场研究 · N 条观点」。
- `note-edit/index.tsx`: replace「关联股票」「请选择一只自选股」「请先添加一只自选股」「添加股票」with「关联标的」「请选择一个自选标的」「请先添加一个研究标的」「添加标的」; use `formatResearchSubjectOption` for `SelectItem`.
- Validation toast becomes「请选择关联标的」。

Do not introduce native Taro `Button` or `Input`; keep using `@/components/ui/button`, `@/components/ui/input`, `Card`, and `Select`.

- [ ] **Step 5: Run frontend tests and validation**

```bash
pnpm exec tsx --test src/stocks/subject.test.ts src/pages/stock/stock-detail-logic.test.ts src/pages/note-edit/note-editor-logic.test.ts && pnpm validate
```

Expected: all focused frontend tests pass and validation exits 0.

- [ ] **Step 6: Commit cross-product integration**

```bash
git add src/pages/index/index.tsx src/pages/library/index.tsx src/pages/profile/index.tsx src/pages/stock-search/index.tsx src/pages/note-edit/index.tsx src/pages/note-edit/note-editor-logic.ts src/pages/note-edit/note-editor-logic.test.ts
git commit -m "feat: 在全产品展示大盘研究标的"
```

### Task 7: Full regression and cross-platform acceptance

**Files:**
- Modify only files required to fix failures directly caused by Tasks 1–6.

- [ ] **Step 1: Run the complete relevant backend suites**

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/stocks/stock-subject.test.ts server/src/stocks/market-subject.service.test.ts server/src/stocks/trade-persistence.test.ts server/src/stocks/price-history.test.ts server/src/ai/daily-brief-persistence.test.ts && pnpm test:agent:all
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run frontend regression and static validation**

```bash
pnpm exec tsx --test src/stocks/subject.test.ts src/pages/stock/stock-detail-logic.test.ts src/pages/note-edit/note-editor-logic.test.ts && pnpm test:prelaunch && pnpm validate
```

Expected: all tests pass; ESLint and TypeScript exit 0.

- [ ] **Step 3: Build both supported clients and server**

```bash
pnpm build:web && pnpm build:weapp && pnpm build:server
```

Expected: H5, 微信小程序和 NestJS server builds exit 0. The removed Douyin target is intentionally not part of acceptance.

- [ ] **Step 4: Run manual H5 acceptance against the local API**

Use the existing local account and verify:

```text
1. 添加页出现唯一的「A股大盘」卡片。
2. 第一次添加成功，再次进入显示“已添加”。
3. 首页、搜索、资料库和个人页显示“市场研究”，不显示内部代码。
4. 大盘详情只出现问 AI、新增观点、上传文档、历史内容和报告。
5. 大盘详情不发出 refresh-price、stop-loss-alert 或 brief 请求。
6. 大盘笔记保存后可在详情与资料库检索。
7. AI 回答使用市场宽度、成交额、行业轮动、资金和情绪框架。
8. 普通股票的行情、持仓、止损、简评、笔记与 AI 路径无回归。
```

- [ ] **Step 5: Inspect final diff and commit any verification fixes**

```bash
git diff --check
git status --short
```

If verification required a source change, stage only that change and its regression test, then commit with:

```bash
git commit -m "fix: 修正大盘研究标的回归问题"
```

If no verification fix was needed, do not create an empty commit.
