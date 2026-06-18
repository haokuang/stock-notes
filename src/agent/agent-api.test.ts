import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AgentApiError,
  createAgentApi,
  unwrapApiResponse,
} from './agent-api'
import {
  errorPresentation,
  formatRetryAfter,
  mergeRun,
  pickActiveRun,
  providerLabel,
  shouldPoll,
  stageLabel,
  upsertMessages,
} from './agent-state'
import type { AgentMessage, AgentRun } from './agent.types'

function makeMessage(partial: Partial<AgentMessage> & { id: string; createdAt: string }): AgentMessage {
  return {
    id: partial.id,
    threadId: partial.threadId ?? 'thread-1',
    userId: partial.userId ?? 'user-1',
    role: partial.role ?? 'user',
    content: partial.content ?? '',
    provider: partial.provider ?? null,
    model: partial.model ?? null,
    runId: partial.runId ?? null,
    citations: partial.citations ?? [],
    metadata: partial.metadata ?? {},
    createdAt: partial.createdAt,
  }
}

test('unwrapApiResponse reads inner data envelope', () => {
  const result = unwrapApiResponse<{ items: string[] }>({ statusCode: 200, data: { data: { items: ['x'] } } })
  assert.deepEqual(result, { items: ['x'] })
})

test('unwrapApiResponse throws AgentApiError on missing envelope', () => {
  assert.throws(() => unwrapApiResponse<unknown>({ statusCode: 200, data: {} }), AgentApiError)
})

test('unwrapApiResponse throws AgentApiError on HTTP error with message', () => {
  assert.throws(
    () => unwrapApiResponse<unknown>({ statusCode: 409, data: { message: 'AGENT_ACTIVE_RUN' } }),
    (err: Error) => err instanceof AgentApiError && err.message === 'AGENT_ACTIVE_RUN',
  )
})

test('agent API uses Network.request with relative URLs only', async () => {
  const calls: Array<{ url: string; method: string; data?: unknown }> = []
  const fakeRequest = (option: { url: string; method: string; data?: unknown }) => {
    calls.push(option)
    return Promise.resolve({ statusCode: 200, data: { data: null } })
  }
  const api = createAgentApi(fakeRequest as never)
  await api.listModels()
  await api.getThread('stock-1')
  await api.listMessages('thread-1')
  await api.getRun('run-1')
  await api.submitMessage('thread-1', { content: 'hi', provider: 'deepseek', model: 'm', clientRequestId: 'req-1234567890abcde' })
  await api.retryRun('run-1', { clientRequestId: 'req-0987654321zyxwv' })
  await api.saveReport('run-1')
  await api.listReports('stock-1')
  await api.getReport('report-1')

  const urls = calls.map((c) => c.url)
  for (const url of urls) {
    assert.ok(url.startsWith('/api/agent/'), `URL must be relative /api/agent/: ${url}`)
  }
  assert.ok(urls.some((u) => u === '/api/agent/models'))
  assert.ok(urls.some((u) => u.startsWith('/api/agent/threads?stock_id=')))
  assert.ok(urls.some((u) => u.startsWith('/api/agent/threads/thread-1/messages')))
  assert.ok(urls.some((u) => u === '/api/agent/runs/run-1'))
  assert.ok(urls.some((u) => u === '/api/agent/runs/run-1/retry'))
  assert.ok(urls.some((u) => u === '/api/agent/runs/run-1/save-report'))
  assert.ok(urls.some((u) => u.startsWith('/api/agent/reports?stock_id=')))
  assert.ok(urls.some((u) => u === '/api/agent/reports/report-1'))
})

test('upsertMessages dedupes by id and keeps chronological order', () => {
  const a = makeMessage({ id: 'a', createdAt: '2026-06-18T10:00:00.000Z' })
  const b = makeMessage({ id: 'b', createdAt: '2026-06-18T10:01:00.000Z' })
  const updatedA = { ...a, content: 'updated' }
  const c = makeMessage({ id: 'c', createdAt: '2026-06-18T09:59:00.000Z' })
  const result = upsertMessages([a, b], [updatedA, c])
  assert.deepEqual(result.map((m) => m.id), ['c', 'a', 'b'])
  assert.equal(result.find((m) => m.id === 'a')?.content, 'updated')
})

test('pickActiveRun prefers running/queued over latest terminal', () => {
  const old: AgentRun = { ...baseRun(), id: 'r-old', status: 'completed', stage: 'completed', createdAt: '2026-06-18T09:00:00.000Z' }
  const active: AgentRun = { ...baseRun(), id: 'r-active', status: 'running', stage: 'loading_context', createdAt: '2026-06-18T10:00:00.000Z' }
  const newer: AgentRun = { ...baseRun(), id: 'r-new', status: 'completed', stage: 'completed', createdAt: '2026-06-18T11:00:00.000Z' }
  assert.equal(pickActiveRun([old, newer])?.id, 'r-new')
  assert.equal(pickActiveRun([old, active, newer])?.id, 'r-active')
  assert.equal(pickActiveRun([]), null)
})

test('stageLabel covers all seven stages', () => {
  const expectedLabels: Record<string, string> = {
    queued: '排队中',
    loading_context: '加载历史',
    calling_tools: '读取本地资料',
    searching: '联网检索',
    generating: '生成回答',
    completed: '已完成',
    failed: '失败',
  }
  for (const [stage, label] of Object.entries(expectedLabels)) {
    assert.equal(stageLabel(stage), label)
  }
  assert.equal(stageLabel(undefined), '排队中')
})

test('errorPresentation maps standardized codes', () => {
  assert.equal(errorPresentation('PROVIDER_AUTH_FAILED').retryable, false)
  assert.equal(errorPresentation('PROVIDER_RATE_LIMITED').retryable, false)
  assert.equal(errorPresentation('AGENT_TIMEOUT').retryable, true)
  assert.equal(errorPresentation('AGENT_WORKER_LOST').retryable, true)
  assert.equal(errorPresentation(null).label, '未知错误')
  assert.equal(errorPresentation('UNKNOWN_CODE').retryable, true)
})

test('formatRetryAfter produces human-friendly text', () => {
  assert.equal(formatRetryAfter(null), null)
  assert.equal(formatRetryAfter(-1), null)
  assert.equal(formatRetryAfter(30), '30 秒后重试')
  assert.equal(formatRetryAfter(120), '2 分钟后重试')
  assert.equal(formatRetryAfter(360), '6 分钟后重试')
})

test('shouldPoll stops at terminal state', () => {
  assert.equal(shouldPoll(null), false)
  assert.equal(shouldPoll({ ...baseRun(), status: 'running' }), true)
  assert.equal(shouldPoll({ ...baseRun(), status: 'queued' }), true)
  assert.equal(shouldPoll({ ...baseRun(), status: 'completed' }), false)
  assert.equal(shouldPoll({ ...baseRun(), status: 'failed' }), false)
})

test('mergeRun preserves existing createdAt', () => {
  const old = { ...baseRun(), id: 'r', createdAt: '2026-06-18T09:00:00.000Z' }
  const next = { ...baseRun(), id: 'r', createdAt: '2026-06-18T10:00:00.000Z', stage: 'completed' as const }
  const merged = mergeRun(old, next)
  assert.equal(merged.createdAt, '2026-06-18T09:00:00.000Z')
  assert.equal(merged.stage, 'completed')
})

test('providerLabel maps provider names', () => {
  assert.equal(providerLabel('deepseek'), 'DeepSeek')
  assert.equal(providerLabel('openai'), 'OpenAI')
  assert.equal(providerLabel('minimax'), 'MiniMax')
  assert.equal(providerLabel(null), '')
})

function baseRun(): AgentRun {
  return {
    id: 'run',
    threadId: 'thread-1',
    userId: 'user-1',
    userMessageId: 'msg',
    clientRequestId: 'req',
    provider: 'deepseek',
    model: 'm',
    credentialMode: 'api',
    status: 'queued',
    stage: 'queued',
    attemptCount: 0,
    maxAttempts: 2,
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    retryAfter: null,
    createdAt: '',
    updatedAt: '',
  }
}