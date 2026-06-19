import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentReportService, buildReportTitle } from './report.service'

function makeClient(handler: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  let releases = 0
  const client = {
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values })
      return handler(text, values)
    },
    release: () => { releases += 1 },
  }
  return { client, calls, getReleaseCount: () => releases }
}

const runRow = {
  id: 'run-1',
  thread_id: 'thread-1',
  user_id: 'user-1',
  user_message_id: 'msg-1',
  client_request_id: 'req-1',
  provider: 'deepseek',
  model: 'deepseek-chat',
  credential_mode: 'api',
  status: 'completed',
  stage: 'completed',
  attempt_count: 1,
  max_attempts: 2,
  locked_at: null,
  locked_by: null,
  started_at: '2026-06-18T10:00:00.000Z',
  completed_at: '2026-06-18T10:01:00.000Z',
  error_code: null,
  error_message: null,
  retry_after: null,
  created_at: '2026-06-18T10:00:00.000Z',
  updated_at: '2026-06-18T10:01:00.000Z',
}

const assistantRow = {
  id: 'msg-assistant-1',
  thread_id: 'thread-1',
  user_id: 'user-1',
  role: 'assistant',
  content: 'final answer content',
  provider: 'deepseek',
  model: 'deepseek-chat',
  run_id: 'run-1',
  citations: [{ id: 'news-1', title: 'A', url: 'https://example.com/a', source: 'example.com', snippet: 'snippet', publishedAt: null }],
  metadata: {},
  created_at: '2026-06-18T10:01:00.000Z',
}

test('saveReport rejects non-completed runs with 404', async () => {
  const { client } = makeClient(async (text) => {
    if (text.includes('FROM agent_runs')) {
      return { rows: [{ ...runRow, status: 'running', stage: 'generating' }] }
    }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  await assert.rejects(
    service.saveReport({ userId: 'user-1', runId: 'run-1' }),
    (err: Error & { statusCode?: number }) => err.statusCode === 404,
  )
})

test('saveReport rejects when no assistant message exists', async () => {
  const { client } = makeClient(async (text) => {
    if (text.includes('FROM agent_runs')) {
      return { rows: [runRow] }
    }
    if (text.includes('FROM agent_messages')) {
      return { rows: [] }
    }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  await assert.rejects(
    service.saveReport({ userId: 'user-1', runId: 'run-1' }),
    (err: Error & { statusCode?: number }) => err.statusCode === 404,
  )
})

test('saveReport inserts an immutable snapshot from the final assistant message', async () => {
  const { client, calls, getReleaseCount } = makeClient(async (text, values) => {
    if (text.includes('FROM agent_runs')) {
      return { rows: [{ ...runRow, stock_id: 'stock-1', stock_code: '600519', stock_name: '贵州茅台' }] }
    }
    if (text.includes('FROM agent_messages')) {
      return { rows: [assistantRow] }
    }
    if (text.includes('FROM stocks')) {
      return { rows: [{ id: 'stock-1', code: '600519', name: '贵州茅台' }] }
    }
    if (text.startsWith('INSERT INTO ai_reports')) {
      assert.equal(values?.[0], 'user-1')
      assert.equal(values?.[1], 'stock-1')
      assert.equal(values?.[3], '贵州茅台')
      assert.match(values?.[4] as string, /贵州茅台 · Agent 投研报告/)
      assert.equal(values?.[5], 'final answer content')
      assert.equal(values?.[6], 'run-1')
      return {
        rows: [{
          id: 'report-1',
          stock_id: 'stock-1',
          stock_code: '600519',
          stock_name: '贵州茅台',
          title: '贵州茅台 · Agent 投研报告',
          status: 'done',
          content: 'final answer content',
          metadata: { provider: 'deepseek', model: 'deepseek-chat' },
          agent_run_id: 'run-1',
          created_at: '2026-06-18T10:02:00.000Z',
        }],
      }
    }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  const report = await service.saveReport({ userId: 'user-1', runId: 'run-1' })
  assert.equal(report.id, 'report-1')
  assert.equal(report.provider, 'deepseek')
  assert.equal(report.model, 'deepseek-chat')
  assert.equal(report.agentRunId, 'run-1')
  assert.match(calls.find((c) => c.text.includes('FROM agent_runs'))!.text, /JOIN agent_threads/)
  assert.match(calls.find((c) => c.text.startsWith('INSERT INTO ai_reports'))!.text, /'agent_report'/)
  assert.match(calls.find((c) => c.text.startsWith('INSERT INTO ai_reports'))!.text, /ON CONFLICT \(agent_run_id\)/)
  assert.doesNotMatch(calls.find((c) => c.text.startsWith('INSERT INTO ai_reports'))!.text, /updated_at/)
  const metadata = JSON.parse(calls.find((c) => c.text.startsWith('INSERT INTO ai_reports'))!.values[7] as string)
  assert.deepEqual(metadata.citations, assistantRow.citations)
  assert.equal(getReleaseCount(), 1)
})

test('saveReport returns the existing report on a second concurrent call', async () => {
  let insertCount = 0
  const { client } = makeClient(async (text) => {
    if (text.includes('FROM agent_runs')) return { rows: [runRow] }
    if (text.includes('FROM agent_messages')) return { rows: [assistantRow] }
    if (text.includes('FROM stocks')) return { rows: [{ id: 'stock-1', code: '600519', name: '贵州茅台' }] }
    if (text.startsWith('INSERT INTO ai_reports')) {
      insertCount += 1
      return {
        rows: [{
          id: 'report-1',
          stock_id: 'stock-1',
          stock_code: '600519',
          stock_name: '贵州茅台',
          title: '贵州茅台 · Agent 投研报告',
          status: 'done',
          content: 'final answer content',
          metadata: { provider: 'deepseek', model: 'deepseek-chat' },
          agent_run_id: 'run-1',
          created_at: '2026-06-18T10:02:00.000Z',
        }],
      }
    }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  const a = await service.saveReport({ userId: 'user-1', runId: 'run-1' })
  const b = await service.saveReport({ userId: 'user-1', runId: 'run-1' })
  assert.equal(a.id, b.id)
  assert.ok(insertCount >= 1)
})

test('saveReport throws 404 when run does not belong to user', async () => {
  const { client } = makeClient(async (text) => {
    if (text.includes('FROM agent_runs')) return { rows: [] }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  await assert.rejects(
    service.saveReport({ userId: 'user-1', runId: 'run-1' }),
    (err: Error & { statusCode?: number }) => err.statusCode === 404,
  )
})

test('getReport returns 404 when report id is unknown', async () => {
  const { client } = makeClient(async (text) => {
    if (text.includes('FROM ai_reports')) return { rows: [] }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })
  const service = createAgentReportService({ clientFactory: async () => client as never })
  await assert.rejects(
    service.getReport({ userId: 'user-1', reportId: 'report-x' }),
    (err: Error & { statusCode?: number }) => err.statusCode === 404,
  )
})

test('buildReportTitle always includes the stock name suffix and is bounded', () => {
  assert.equal(buildReportTitle('贵州茅台'), '贵州茅台 · Agent 投研报告')
  assert.equal(buildReportTitle(''), '股票 · Agent 投研报告')
  assert.equal(buildReportTitle(null), '股票 · Agent 投研报告')
  assert.equal(buildReportTitle('A'.repeat(300)).length <= 200, true)
})
