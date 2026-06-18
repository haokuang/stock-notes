import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRepository } from './agent.repository'

function makePool(rowsByCall: unknown[][]) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  return {
    calls,
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values })
      return { rows: rowsByCall.shift() ?? [] }
    },
  }
}

const threadRow = {
  id: 'thread-1',
  user_id: 'user-1',
  stock_id: 'stock-1',
  title: '贵州茅台',
  created_at: '2026-06-18T10:00:00.000Z',
  updated_at: '2026-06-18T10:00:00.000Z',
}

test('creates a thread through an ownership-filtered idempotent statement', async () => {
  const pool = makePool([[threadRow]])
  const repository = new AgentRepository(pool as never)

  const result = await repository.getOrCreateThread('user-1', 'stock-1')

  assert.equal(result.id, 'thread-1')
  assert.match(pool.calls[0].text, /SELECT \$1, id, name FROM stocks/)
  assert.match(pool.calls[0].text, /WHERE id = \$2 AND user_id = \$1/)
  assert.match(pool.calls[0].text, /ON CONFLICT \(user_id, stock_id\)/)
  assert.deepEqual(pool.calls[0].values, ['user-1', 'stock-1'])
})

test('returns null instead of exposing another user thread', async () => {
  const pool = makePool([[]])
  const repository = new AgentRepository(pool as never)

  assert.equal(await repository.findThread('user-2', 'thread-1'), null)
  assert.match(pool.calls[0].text, /user_id = \$1/)
  assert.match(pool.calls[0].text, /id = \$2/)
})

test('returns messages chronologically and creates an older-page cursor', async () => {
  const newer = {
    id: 'message-2', thread_id: 'thread-1', user_id: 'user-1', role: 'assistant',
    content: 'newer', provider: 'openai', model: 'gpt', run_id: 'run-1', citations: [],
    metadata: {}, created_at: '2026-06-18T10:01:00.000Z',
  }
  const older = { ...newer, id: 'message-1', content: 'older', created_at: '2026-06-18T10:00:00.000Z' }
  const overflow = { ...newer, id: 'message-0', content: 'overflow', created_at: '2026-06-18T09:59:00.000Z' }
  const pool = makePool([[newer, older, overflow]])
  const repository = new AgentRepository(pool as never)

  const page = await repository.listMessages('user-1', 'thread-1', null, 2)

  assert.deepEqual(page.items.map((item) => item.id), ['message-1', 'message-2'])
  assert.ok(page.nextCursor)
  assert.match(pool.calls[0].text, /ORDER BY m.created_at DESC, m.id DESC/)
  assert.equal(pool.calls[0].values.at(-1), 3)
})

test('filters runs and reports by owner and stock', async () => {
  const runRow = {
    id: 'run-1', thread_id: 'thread-1', user_id: 'user-1', user_message_id: 'message-1',
    client_request_id: 'request-1', provider: 'deepseek', model: 'deepseek-chat', credential_mode: 'api',
    status: 'queued', stage: 'queued', attempt_count: 0, max_attempts: 2, locked_at: null,
    locked_by: null, started_at: null, completed_at: null, error_code: null, error_message: null,
    retry_after: null, created_at: '2026-06-18T10:00:00.000Z', updated_at: '2026-06-18T10:00:00.000Z',
  }
  const reportRow = {
    id: 'report-1', stock_id: 'stock-1', stock_code: '600519', stock_name: '贵州茅台',
    title: '报告', status: 'done', agent_run_id: 'run-1', created_at: '2026-06-18T11:00:00.000Z',
  }
  const pool = makePool([[runRow], [reportRow]])
  const repository = new AgentRepository(pool as never)

  assert.equal((await repository.findRun('user-1', 'run-1'))?.id, 'run-1')
  assert.equal((await repository.listReports('user-1', 'stock-1'))[0].id, 'report-1')
  assert.match(pool.calls[0].text, /user_id = \$1 AND id = \$2/)
  assert.match(pool.calls[1].text, /user_id = \$1 AND stock_id = \$2/)
})
