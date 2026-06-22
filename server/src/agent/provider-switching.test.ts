import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentOrchestrator } from './agent-orchestrator'
import { AgentToolRegistry } from './tools/tool-registry'
import { createStockProfileTool } from './tools/stock-profile.tool'
import { createPriceHistoryTool } from './tools/price-history.tool'
import { createStockNotesTool } from './tools/stock-notes.tool'
import { createDailyBriefsTool } from './tools/daily-briefs.tool'
import { createStockNewsTool } from './tools/stock-news.tool'
import type { AgentRun } from './agent.types'
import type { AgentModelProvider } from './providers/provider.types'

const baseRun = {
  id: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
  userMessageId: 'msg-current',
  clientRequestId: 'req-1',
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

function makeMessage(id: string, role: 'user' | 'assistant', content: string, provider: string | null, model: string | null, createdAt: string) {
  return {
    id, threadId: 'thread-1', userId: 'user-1', role, content, provider, model,
    runId: null, citations: [], metadata: {}, createdAt,
  }
}

function makeRepo(history: ReturnType<typeof makeMessage>[]) {
  return {
    findThread: async () => ({
      id: 'thread-1', userId: 'user-1', stockId: 'stock-1', title: '贵州茅台',
      createdAt: '2026-06-18T09:00:00.000Z', updatedAt: '2026-06-18T10:00:00.000Z',
    }),
    listMessages: async () => ({ items: history.slice().reverse(), nextCursor: null }),
    getStockProfile: async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const, industry: null, currentPrice: null, changeAmount: null, changePercent: null, priceDate: null, openPrice: null, highPrice: null, lowPrice: null, preClose: null, note: null }),
    getPriceHistory: async () => [],
    getStockNotes: async () => [],
    getDailyBriefs: async () => [],
    persistToolCall: async (call: import('./agent.types').AgentToolCall) => ({ ...call, id: `t-${call.toolName}` }),
    updateRunStage: async () => undefined,
  }
}

function makeStockIdentity() {
  return async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const })
}

function buildOrchestrator(provider: AgentModelProvider, repo: ReturnType<typeof makeRepo>) {
  const tavily = { async search() { return { results: [] } } }
  const tools = [
    createStockProfileTool(repo as never),
    createPriceHistoryTool(repo as never),
    createStockNotesTool(repo as never),
    createDailyBriefsTool(repo as never),
    createStockNewsTool({ tavily: tavily as never, stockIdentity: makeStockIdentity() }),
  ]
  const registry = new AgentToolRegistry({ tools })
  return new AgentOrchestrator({
    provider,
    registry,
    repository: repo as never,
    stockIdentity: makeStockIdentity(),
  })
}

async function captureMessages(providerName: 'deepseek' | 'openai' | 'minimax'): Promise<Array<{ role: string; content: string; provider?: string }>> {
  const captured: Array<{ messages: unknown[]; tools: unknown[] }> = []
  const provider: AgentModelProvider = {
    provider: providerName,
    async generate(request) {
      captured.push({ messages: [...request.messages], tools: [...request.tools] })
      return { content: `${providerName}-answer`, toolCalls: [], citations: [], providerMetadata: {} }
    },
    async checkHealth() {
      return { status: 'available', reason: null, retryAfter: null, checkedAt: '2026-06-18T10:00:00.000Z' }
    },
  }
  const history = [
    makeMessage('msg-1', 'user', '历史问题 1', null, null, '2026-06-18T09:00:00.000Z'),
    makeMessage('msg-2', 'assistant', 'deepseek 答 1', 'deepseek', 'ds', '2026-06-18T09:01:00.000Z'),
    makeMessage('msg-3', 'user', '历史问题 2', null, null, '2026-06-18T09:30:00.000Z'),
    makeMessage('msg-4', 'assistant', 'openai 答 2', 'openai', 'o', '2026-06-18T09:31:00.000Z'),
    makeMessage('msg-5', 'assistant', 'minimax 答 3', 'minimax', 'm', '2026-06-18T09:32:00.000Z'),
    makeMessage('msg-current', 'user', '当前问题', null, null, '2026-06-18T10:00:00.000Z'),
  ]
  const repo = makeRepo(history)
  const run = { ...baseRun, provider: providerName, model: `${providerName}-model` } as AgentRun
  const orchestrator = buildOrchestrator(provider, repo)
  await orchestrator.run({ run, userId: 'user-1', stockId: 'stock-1', threadId: 'thread-1' })
  return captured[0].messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }))
}

test('cross-provider history is identical for deepseek/openai/minimax runs', async () => {
  const deepseek = await captureMessages('deepseek')
  const openai = await captureMessages('openai')
  const minimax = await captureMessages('minimax')
  const stripSystem = (messages: Array<{ role: string; content: string }>) =>
    messages.filter((m) => m.role !== 'system')
  assert.deepEqual(stripSystem(openai), stripSystem(deepseek))
  assert.deepEqual(stripSystem(minimax), stripSystem(deepseek))
})

test('provider-specific response objects never appear in prior history', async () => {
  const deepseek = await captureMessages('deepseek')
  const system = deepseek.find((m) => m.role === 'system')
  assert.ok(system)
  for (const message of deepseek) {
    if (message.role === 'assistant') {
      assert.match(message.content, /^\[(deepseek|openai|minimax)\]/)
    }
  }
  const toolDefs = await captureMessages('openai')
  assert.ok(toolDefs.length > 0)
})
