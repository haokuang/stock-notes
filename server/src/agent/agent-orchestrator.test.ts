import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentOrchestrator } from './agent-orchestrator'
import { AgentToolRegistry } from './tools/tool-registry'
import { createStockProfileTool } from './tools/stock-profile.tool'
import { createPriceHistoryTool } from './tools/price-history.tool'
import { createStockNotesTool } from './tools/stock-notes.tool'
import { createDailyBriefsTool } from './tools/daily-briefs.tool'
import { createStockNewsTool } from './tools/stock-news.tool'
import type { AgentCitation } from './agent.types'
import type { AgentModelProvider, AgentTurnResult } from './providers/provider.types'
import type { AgentRun, AgentToolCall } from './agent.types'

const run = {
  id: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
  userMessageId: 'msg-current',
  clientRequestId: 'req-1',
  provider: 'deepseek' as const,
  model: 'm',
  credentialMode: 'api' as const,
  status: 'running' as const,
  stage: 'loading_context' as const,
  attemptCount: 0,
  maxAttempts: 2,
  lockedAt: null,
  lockedBy: null,
  startedAt: null,
  completedAt: null,
  errorCode: null,
  errorMessage: null,
  retryAfter: null,
  createdAt: '2026-06-18T10:00:00.000Z',
  updatedAt: '2026-06-18T10:00:00.000Z',
}

function makeRepo() {
  return {
    findThread: async () => ({
      id: 'thread-1', userId: 'user-1', stockId: 'stock-1', title: '贵州茅台',
      createdAt: '2026-06-18T09:00:00.000Z', updatedAt: '2026-06-18T10:00:00.000Z',
    }),
    listMessages: async () => ({
      items: [{ id: 'msg-current', threadId: 'thread-1', userId: 'user-1', role: 'user' as const, content: '当前', provider: null, model: null, runId: null, citations: [], metadata: {}, createdAt: '2026-06-18T10:00:00.000Z' }],
      nextCursor: null,
    }),
    getStockProfile: async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const, industry: '白酒', currentPrice: '1700', changeAmount: '10', changePercent: '0.59', priceDate: '20260618', openPrice: '1690', highPrice: '1710', lowPrice: '1680', preClose: '1690', note: null }),
    getPriceHistory: async () => [],
    getStockNotes: async () => [],
    getDailyBriefs: async () => [],
    persistToolCall: async (call: AgentToolCall) => ({ ...call, id: `t-${call.toolName}-${call.runId}` }),
    updateRunStage: async (_runId: string, _stage: AgentRun['stage']) => undefined,
  }
}

function makeStockIdentity() {
  return async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const })
}

function makeProvider(script: Array<{
  content?: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
}>) {
  let index = 0
  const calls: Array<{ messages: unknown[]; tools: unknown[] }> = []
  const provider: AgentModelProvider = {
    provider: 'deepseek',
    async generate(request) {
      calls.push({ messages: [...request.messages], tools: [...request.tools] })
      const next = script[index++] ?? { content: 'fallback' }
      return {
        content: next.content ?? '',
        toolCalls: (next.toolCalls ?? []).map((call) => ({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        })),
        citations: [],
        providerMetadata: {},
      }
    },
    async checkHealth() {
      return { status: 'available', reason: null, retryAfter: null, checkedAt: '2026-06-18T10:00:00.000Z' }
    },
  }
  return { provider, calls }
}

function buildOrchestrator(provider: AgentModelProvider, options: {
  tavily?: { results: Array<{ title: string; url: string; content: string; published_date: string | null }>; throw?: boolean }
  persistCalls?: AgentToolCall[]
  stockIdentity?: () => Promise<{ code: string; name: string; subjectType: 'stock' | 'market' }>
} = {}) {
  const repository = makeRepo()
  const stockIdentity = options.stockIdentity ?? makeStockIdentity()
  const tavily = {
    async search() {
      if (options.tavily?.throw) {
        const err = new Error('TAVILY HTTP 500') as Error & { searchUnavailable?: boolean }
        err.searchUnavailable = true
        throw err
      }
      return { results: options.tavily?.results ?? [] }
    },
  }
  const tavilyClient = tavily as never
  const tools = [
    createStockProfileTool(repository as never),
    createPriceHistoryTool(repository as never),
    createStockNotesTool(repository as never),
    createDailyBriefsTool(repository as never),
    createStockNewsTool({ tavily: tavilyClient, stockIdentity }),
  ]
  const registry = new AgentToolRegistry({ tools })
  const orchestrator = new AgentOrchestrator({
    provider,
    registry,
    repository: repository as never,
    stockIdentity,
  })
  return { orchestrator, calls: (provider as unknown as { calls: unknown }).calls, repository }
}

test('orchestrator returns direct content on first cycle without tools', async () => {
  const { provider } = makeProvider([{ content: '直接回答' }])
  const { orchestrator } = buildOrchestrator(provider)
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.equal(result.content, '直接回答')
  assert.deepEqual(result.citations, [])
  assert.equal(result.toolCalls.length, 0)
})

test('orchestrator only exposes market-compatible tools to the provider', async () => {
  const { provider, calls } = makeProvider([{ content: '市场回答' }])
  const { orchestrator } = buildOrchestrator(provider, {
    stockIdentity: async () => ({
      code: 'MARKET_A_SHARE',
      name: 'A股大盘',
      subjectType: 'market',
    }),
  })
  await orchestrator.run({ run, userId: 'user-1', stockId: 'market-1', threadId: 'thread-1' })
  assert.deepEqual(
    (calls[0].tools as Array<{ name: string }>).map((tool) => tool.name),
    ['get_stock_profile', 'get_stock_notes', 'search_stock_news'],
  )
})

test('orchestrator executes one tool call, returns its result to the model and finalizes on second cycle', async () => {
  const { provider } = makeProvider([
    {
      toolCalls: [
        { id: 'call-1', name: 'get_stock_profile', arguments: {} },
      ],
    },
    { content: '已读取资料：估值合理' },
  ])
  const { orchestrator } = buildOrchestrator(provider)
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.equal(result.content, '已读取资料：估值合理')
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].toolName, 'get_stock_profile')
  assert.equal(result.toolCalls[0].status, 'completed')
})

test('orchestrator handles up to six cycles; seventh cycle throws AGENT_TOOL_LIMIT', async () => {
  const script = Array.from({ length: 7 }, () => ({
    toolCalls: [{ id: `call-${Math.random()}`, name: 'get_stock_profile', arguments: {} }],
  }))
  const { provider } = makeProvider(script)
  const { orchestrator } = buildOrchestrator(provider)
  await assert.rejects(
    orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' }),
    /AGENT_TOOL_LIMIT/,
  )
})

test('orchestrator surfaces tool validation error to the model and continues', async () => {
  const { provider } = makeProvider([
    {
      toolCalls: [
        { id: 'bad-call', name: 'search_stock_news', arguments: { maxResults: 999 } },
      ],
    },
    { content: '参数非法，已忽略该工具结果' },
  ])
  const { orchestrator } = buildOrchestrator(provider)
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.equal(result.content, '参数非法，已忽略该工具结果')
})

test('orchestrator surfaces tool execution error to the model', async () => {
  const { provider } = makeProvider([
    { toolCalls: [{ id: 'call-x', name: 'get_stock_profile', arguments: {} }] },
    { content: '工具失败，已降级' },
  ])
  const { orchestrator, repository } = buildOrchestrator(provider)
  const original = repository.getStockProfile
  repository.getStockProfile = async () => { throw new Error('DB down') }
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.equal(result.content, '工具失败，已降级')
  assert.equal(result.toolCalls[0].status, 'failed')
  repository.getStockProfile = original
})

test('orchestrator discloses Tavily failure with fixed sentence when model omits it', async () => {
  const { provider } = makeProvider([
    {
      toolCalls: [{ id: 'call-s', name: 'search_stock_news', arguments: { query: '业绩' } }],
    },
    { content: '依据本地资料...' },
  ])
  const { orchestrator } = buildOrchestrator(provider, { tavily: { results: [], throw: true } })
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.match(result.content, /本次联网资料获取失败，回答仅基于本地研究记录/)
  assert.equal(result.citations.length, 0)
})

test('orchestrator returns verified citations produced by the news tool', async () => {
  const { provider } = makeProvider([
    { toolCalls: [{ id: 'call-s', name: 'search_stock_news', arguments: { query: '业绩' } }] },
    { content: '据 news-1 报道...' },
  ])
  const citations: AgentCitation[] = [
    {
      id: 'news-1', title: 'A', url: 'https://example.com/a', source: 'example.com',
      snippet: 'snippet', publishedAt: null,
    },
  ]
  const { orchestrator } = buildOrchestrator(provider, {
    tavily: { results: [{ title: 'A', url: 'https://example.com/a', content: 'snippet', published_date: null }] },
  })
  const result = await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  assert.deepEqual(result.citations, citations)
})

test('orchestrator honors outer abort signal and throws AGENT_TIMEOUT', async () => {
  const { provider } = makeProvider([{ content: 'never' }])
  provider.generate = async (request) => {
    return await new Promise<AgentTurnResult>((resolve, reject) => {
      const signal = request.signal
      if (signal?.aborted) reject(signal.reason ?? new Error('aborted'))
      signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
      setTimeout(() => resolve({ content: 'late', toolCalls: [], citations: [], providerMetadata: {} }), 200)
    })
  }
  const { orchestrator } = buildOrchestrator(provider)
  await assert.rejects(
    orchestrator.run({
      run,
      userId: 'user-1',
      stockId: 'stock-1',
      threadId: 'thread-1',
      deadlineMs: 20,
    }),
    /AGENT_TIMEOUT/,
  )
})

test('orchestrator propagates ownership error on unknown thread', async () => {
  const { provider } = makeProvider([{ content: 'ok' }])
  const { orchestrator, repository } = buildOrchestrator(provider)
  repository.findThread = (async () => null) as never
  await assert.rejects(
    orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' }),
    /资源不存在/,
  )
})

test('orchestrator selects the provider recorded on each run', async () => {
  const deepseek = makeProvider([{ content: 'deepseek answer' }]).provider
  const openai = { ...makeProvider([{ content: 'openai answer' }]).provider, provider: 'openai' as const }
  const providers = new Map([['deepseek', deepseek], ['openai', openai]])
  const repository = makeRepo()
  const orchestrator = new AgentOrchestrator({
    providerRegistry: { get: (name) => providers.get(name) as AgentModelProvider },
    registry: new AgentToolRegistry({ tools: [] }),
    repository: repository as never,
    stockIdentity: makeStockIdentity(),
  })

  const result = await orchestrator.run({
    run: { ...run, provider: 'openai' },
    userId: 'user-1',
    stockId: 'stock-1',
    threadId: 'thread-1',
  })
  assert.equal(result.content, 'openai answer')
})
