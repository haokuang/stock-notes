import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRunQueueRepository } from './run-queue.repository'

function makeRepo(handler: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  return {
    calls,
    repository: new AgentRunQueueRepository({
      clientFactory: () => ({
        query: async (text: string, values: unknown[] = []) => {
          calls.push({ text, values })
          return handler(text, values)
        },
      }),
    }),
  }
}

test('finalizeSuccess inserts assistant message, closes tool calls and marks run completed in one transaction', async () => {
  const { calls, repository } = makeRepo(async (text) => {
    if (text.startsWith('BEGIN')) return { rows: [] }
    if (text.startsWith('INSERT INTO agent_messages')) {
      return { rows: [{ id: 'assistant-msg-1' }] }
    }
    if (text.startsWith('UPDATE agent_tool_calls')) {
      return { rows: [] }
    }
    if (text.startsWith('UPDATE agent_runs')) {
      return { rows: [{ id: 'run-1' }] }
    }
    if (text.startsWith('COMMIT')) return { rows: [] }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })

  await repository.finalizeSuccess({
    runId: 'run-1',
    workerId: 'worker-1',
    userId: 'user-1',
    threadId: 'thread-1',
    content: '最终结论',
    model: 'deepseek-chat',
    provider: 'deepseek',
    citations: [{ id: 'news-1', title: 'A', url: 'https://example.com/a', source: 'example.com', snippet: 'snippet', publishedAt: null }],
    providerMetadata: { reason: 'ok' },
  })

  const queries = calls.map((c) => c.text.split('\n')[0])
  assert.ok(queries.includes('BEGIN'))
  assert.ok(queries.some((q) => q.startsWith('INSERT INTO agent_messages')))
  assert.ok(queries.some((q) => q.startsWith('UPDATE agent_tool_calls')))
  assert.ok(queries.some((q) => q.startsWith('UPDATE agent_runs')))
  assert.ok(queries.includes('COMMIT'))
})

test('finalizeSuccess aborts and rolls back when assistant insert fails', async () => {
  const { calls, repository } = makeRepo(async (text) => {
    if (text.startsWith('BEGIN')) return { rows: [] }
    if (text.startsWith('INSERT INTO agent_messages')) {
      throw new Error('insert failure')
    }
    if (text.startsWith('UPDATE agent_tool_calls')) {
      return { rows: [] }
    }
    if (text.startsWith('UPDATE agent_runs')) {
      return { rows: [{ id: 'run-1' }] }
    }
    if (text.startsWith('COMMIT')) return { rows: [] }
    if (text.startsWith('ROLLBACK')) return { rows: [] }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })

  await assert.rejects(
    repository.finalizeSuccess({
      runId: 'run-1',
      workerId: 'worker-1',
      userId: 'user-1',
      threadId: 'thread-1',
      content: 'final',
      model: 'm',
      provider: 'deepseek',
      citations: [],
      providerMetadata: {},
    }),
    /insert failure/,
  )

  const queries = calls.map((c) => c.text)
  assert.ok(queries.some((q) => q.startsWith('ROLLBACK')))
  assert.ok(!queries.some((q) => q.startsWith('UPDATE agent_runs') && q.includes("status = 'completed'")))
})

test('finalizeSuccess updates only runs owned by this worker', async () => {
  const { calls, repository } = makeRepo(async (text, values) => {
    if (text.startsWith('BEGIN')) return { rows: [] }
    if (text.startsWith('INSERT INTO agent_messages')) return { rows: [{ id: 'msg-1' }] }
    if (text.startsWith('UPDATE agent_tool_calls')) return { rows: [] }
    if (text.startsWith('UPDATE agent_runs')) {
      assert.deepEqual(values?.[0], 'run-1')
      assert.deepEqual(values?.[1], 'worker-1')
      assert.match(text, /WHERE id = \$1 AND status = 'running' AND locked_by = \$2/)
      return { rows: [{ id: 'run-1' }] }
    }
    if (text.startsWith('COMMIT')) return { rows: [] }
    throw new Error(`Unexpected: ${text.slice(0, 80)}`)
  })

  await repository.finalizeSuccess({
    runId: 'run-1',
    workerId: 'worker-1',
    userId: 'user-1',
    threadId: 'thread-1',
    content: 'final',
    model: 'm',
    provider: 'deepseek',
    citations: [],
    providerMetadata: {},
  })

  assert.ok(calls.some((c) => c.text.startsWith('UPDATE agent_runs')))
})