import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentContext } from './agent-context.builder'
import { buildSystemPrompt } from './system-prompt'
import type { AgentMessage } from '../agent.types'
import type { AgentStandardMessage } from '../providers/provider.types'

function makeMessage(partial: Partial<AgentMessage> & { id: string }): AgentMessage {
  return {
    id: partial.id,
    threadId: partial.threadId ?? 'thread-1',
    userId: partial.userId ?? 'user-1',
    role: partial.role ?? 'assistant',
    content: partial.content ?? '',
    provider: partial.provider ?? null,
    model: partial.model ?? null,
    runId: partial.runId ?? null,
    citations: partial.citations ?? [],
    metadata: partial.metadata ?? {},
    createdAt: partial.createdAt ?? '2026-06-18T10:00:00.000Z',
  }
}

const run = {
  id: 'run-current',
  threadId: 'thread-1',
  userId: 'user-1',
  userMessageId: 'msg-current',
  clientRequestId: 'req-current',
  provider: 'deepseek' as const,
  model: 'deepseek-chat',
  credentialMode: 'api' as const,
  status: 'running' as const,
  stage: 'generating' as const,
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

function makeDeps() {
  const calls: Array<{ text: string; values: unknown[] }> = []
  let next = 0
  const rows: AgentMessage[][] = [[]]
  const pool = {
    calls,
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values })
      return { rows: rows[next++] ?? [] }
    },
  }
  const repository = {
    pool,
    findThread: async () => ({
      id: 'thread-1', userId: 'user-1', stockId: 'stock-1', title: '贵州茅台',
      createdAt: '2026-06-18T09:00:00.000Z', updatedAt: '2026-06-18T10:00:00.000Z',
    }),
    listMessages: async (): Promise<{ items: AgentMessage[]; nextCursor: null }> => ({ items: [], nextCursor: null }),
  }
  const stockIdentity = async () => ({ code: '600519', name: '贵州茅台', subjectType: 'stock' as const })
  return { pool, repository, stockIdentity, calls }
}

test('context builder returns system + neutral history + current message in stable order', async () => {
  const priorAsc: AgentMessage[] = [
    makeMessage({ id: 'msg-1', role: 'user', content: '历史问题 1', provider: null, createdAt: '2026-06-18T09:00:00.000Z' }),
    makeMessage({ id: 'msg-2', role: 'assistant', content: '历史回答 1', provider: 'openai', model: 'gpt', createdAt: '2026-06-18T09:01:00.000Z' }),
    makeMessage({ id: 'msg-3', role: 'user', content: '历史问题 2', createdAt: '2026-06-18T09:30:00.000Z' }),
    makeMessage({ id: 'msg-4', role: 'assistant', content: '历史回答 2', provider: 'minimax', model: 'm', createdAt: '2026-06-18T09:31:00.000Z' }),
    makeMessage({ id: 'msg-current', role: 'user', content: '当前问题', createdAt: '2026-06-18T10:00:00.000Z' }),
  ]
  const deps = makeDeps()
  deps.repository.listMessages = async () => ({ items: priorAsc.slice().reverse(), nextCursor: null })

  const context = await buildAgentContext({
    run,
    userId: 'user-1',
    stockId: 'stock-1',
    threadId: 'thread-1',
    repository: deps.repository as never,
    stockIdentity: deps.stockIdentity,
    tools: [],
  })

  const messages = context.messages
  assert.equal(messages[0].role, 'system')
  assert.equal(messages.at(-1)?.content, '当前问题')
  const userMessages = messages.filter((m) => m.role === 'user')
  assert.equal(userMessages.length, 3)
  const assistantMessages = messages.filter((m) => m.role === 'assistant')
  assert.equal(assistantMessages.length, 2)
})

test('context builder preserves provider names in metadata only, never as roles', async () => {
  const priorAsc: AgentMessage[] = [
    makeMessage({ id: 'msg-1', role: 'assistant', content: 'hi', provider: 'openai', model: 'gpt', createdAt: '2026-06-18T09:00:00.000Z' }),
    makeMessage({ id: 'msg-2', role: 'assistant', content: 'hi', provider: 'minimax', model: 'm', createdAt: '2026-06-18T09:01:00.000Z' }),
    makeMessage({ id: 'msg-current', role: 'user', content: '当前', createdAt: '2026-06-18T10:00:00.000Z' }),
  ]
  const deps = makeDeps()
  deps.repository.listMessages = async () => ({ items: priorAsc.slice().reverse(), nextCursor: null })

  const context = await buildAgentContext({
    run,
    userId: 'user-1',
    stockId: 'stock-1',
    threadId: 'thread-1',
    repository: deps.repository as never,
    stockIdentity: deps.stockIdentity,
    tools: [],
  })

  for (const message of context.messages) {
    if (message.role === 'assistant' || message.role === 'user' || message.role === 'tool') {
      assert.ok(!('provider' in message), 'no provider key on role-shaped message')
    }
  }
  const assistantMessages = context.messages.filter((m) => m.role === 'assistant')
  assert.ok(assistantMessages.every((m) => m.content.startsWith('[openai]') || m.content.startsWith('[minimax]')))
})

test('context builder links tool messages by toolCallId and never drops current user message', async () => {
  const priorAsc: AgentMessage[] = [
    makeMessage({ id: 'msg-a', role: 'assistant', content: '调用工具', provider: 'openai', model: 'gpt', createdAt: '2026-06-18T09:00:00.000Z', metadata: { toolCalls: [{ id: 'call-1', name: 'get_stock_profile', arguments: {} }] } }),
    makeMessage({ id: 'msg-t', role: 'tool', content: '{"ok":true}', createdAt: '2026-06-18T09:01:00.000Z', metadata: { toolCallId: 'call-1', toolName: 'get_stock_profile' } }),
    makeMessage({ id: 'msg-current', role: 'user', content: '当前问题', createdAt: '2026-06-18T10:00:00.000Z' }),
  ]
  const deps = makeDeps()
  deps.repository.listMessages = async () => ({ items: priorAsc.slice().reverse(), nextCursor: null })

  const context = await buildAgentContext({
    run,
    userId: 'user-1',
    stockId: 'stock-1',
    threadId: 'thread-1',
    repository: deps.repository as never,
    stockIdentity: deps.stockIdentity,
    tools: [],
  })

  const toolMessage = context.messages.find((m) => m.role === 'tool')
  assert.ok(toolMessage)
  assert.equal((toolMessage as AgentStandardMessage).toolCallId, 'call-1')
  assert.equal(context.messages.at(-1)?.content, '当前问题')
})

test('system prompt states identity, scope, citation rule and external-content distrust', () => {
  const prompt = buildSystemPrompt({
    provider: 'deepseek',
    model: 'deepseek-chat',
    stockCode: '600519',
    stockName: '贵州茅台',
    subjectType: 'stock',
  })
  assert.match(prompt, /600519/)
  assert.match(prompt, /贵州茅台/)
  assert.match(prompt, /只读|不可修改/)
  assert.match(prompt, /引用|不得/)
  assert.match(prompt, /外部内容|不可信|不得执行/)
  assert.match(prompt, /不确定性|可能/)
  assert.match(prompt, /不执行交易|不可代为下单/)
})

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
    stockIdentity: async () => ({
      code: 'MARKET_A_SHARE',
      name: 'A股大盘',
      subjectType: 'market',
    }),
    tools: [
      { name: 'get_stock_profile', description: '', inputSchema: {} },
      { name: 'get_price_history', description: '', inputSchema: {} },
      { name: 'get_daily_briefs', description: '', inputSchema: {} },
      { name: 'get_stock_notes', description: '', inputSchema: {} },
      { name: 'search_stock_news', description: '', inputSchema: {} },
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
