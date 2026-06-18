import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRunQueueRepository, AgentRunQueueRepositoryOptions } from './run-queue.repository'

function makeRepo(options: AgentRunQueueRepositoryOptions = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  return {
    calls,
    repository: new AgentRunQueueRepository({
      ...options,
      clientFactory: () => {
        return {
          calls,
          query: async (text: string, values: unknown[] = []) => {
            calls.push({ text, values })
            throw new Error(`Unexpected query: ${text.slice(0, 80)}`)
          },
        }
      },
    }),
  }
}

test('claim selects queued runs in FIFO order with FOR UPDATE SKIP LOCKED', async () => {
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string, values: unknown[] = []) => {
        if (text.includes('FOR UPDATE SKIP LOCKED')) {
          assert.match(text, /ORDER BY created_at, id/)
          assert.match(text, /LIMIT \$1/)
          return {
            rows: [
              { id: 'run-1', user_id: 'user-1', thread_id: 'thread-1', user_message_id: 'msg-1', provider: 'deepseek', model: 'm', attempt_count: 0, max_attempts: 2 },
              { id: 'run-2', user_id: 'user-1', thread_id: 'thread-1', user_message_id: 'msg-2', provider: 'openai', model: 'gpt', attempt_count: 0, max_attempts: 2 },
            ],
          }
        }
        if (text.startsWith('UPDATE agent_runs')) {
          return { rows: [] }
        }
        throw new Error(`Unexpected: ${text.slice(0, 80)}`)
      },
    }),
  })

  const runs = await repository.claim({ workerId: 'worker-1', limit: 5 })
  assert.equal(runs.length, 2)
  assert.equal(runs[0].id, 'run-1')
})

test('heartbeat updates only matching locked_by', async () => {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string, values: unknown[] = []) => {
        calls.push({ text, values })
        return { rows: [{ id: 'run-1' }] }
      },
    }),
  })

  await repository.heartbeat({ runId: 'run-1', workerId: 'worker-1' })
  const update = calls.find((c) => c.text.startsWith('UPDATE agent_runs'))
  assert.ok(update)
  assert.deepEqual(update.values, ['run-1', 'worker-1'])
})

test('markRetryable returns the run to queued and clears the lock', async () => {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string, values: unknown[] = []) => {
        calls.push({ text, values })
        return { rows: [] }
      },
    }),
  })

  await repository.markRetryable({ runId: 'run-1', workerId: 'worker-1', errorCode: 'UPSTREAM_TIMEOUT', errorMessage: 'gateway timeout' })
  const update = calls.find((c) => c.text.startsWith('UPDATE agent_runs'))
  assert.ok(update)
  assert.match(update.text, /status = 'queued'/)
  assert.match(update.text, /stage = 'queued'/)
  assert.match(update.text, /locked_at = NULL/)
  assert.match(update.text, /locked_by = NULL/)
  assert.match(update.text, /error_code = NULL/)
  assert.match(update.text, /WHERE id = \$1 AND status = 'running' AND locked_by = \$2/)
})

test('markFailed records the safe error and clears the lock', async () => {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string, values: unknown[] = []) => {
        calls.push({ text, values })
        return { rows: [] }
      },
    }),
  })

  await repository.markFailed({ runId: 'run-1', workerId: 'worker-1', errorCode: 'AGENT_TOOL_LIMIT', errorMessage: 'exceeded tool limit' })
  const update = calls.find((c) => c.text.startsWith('UPDATE agent_runs'))
  assert.ok(update)
  assert.match(update.text, /status = 'failed'/)
  assert.match(update.text, /stage = 'failed'/)
  assert.match(update.text, /locked_at = NULL/)
})

test('scanExpiredLeases returns rows whose lock has elapsed past DB now()', async () => {
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string) => {
        assert.match(text, /NOW\(\) - locked_at > INTERVAL/)
        assert.match(text, /status = 'running'/)
        return { rows: [{ id: 'run-1' }, { id: 'run-2' }] }
      },
    }),
  })

  const ids = await repository.scanExpiredLeases({ leaseMs: 45_000 })
  assert.deepEqual(ids, ['run-1', 'run-2'])
})

test('two concurrent claim requests never return the same run id', async () => {
  let callCount = 0
  const sharedRuns = [
    { id: 'run-1', user_id: 'user-1', thread_id: 'thread-1', user_message_id: 'msg-1', provider: 'deepseek', model: 'm', attempt_count: 0, max_attempts: 2 },
    { id: 'run-2', user_id: 'user-1', thread_id: 'thread-1', user_message_id: 'msg-2', provider: 'deepseek', model: 'm', attempt_count: 0, max_attempts: 2 },
  ]
  const repository = new AgentRunQueueRepository({
    clientFactory: () => ({
      query: async (text: string) => {
        if (text.includes('FOR UPDATE SKIP LOCKED')) {
          callCount += 1
          if (callCount % 2 === 0) {
            return { rows: [sharedRuns[1]] }
          }
          return { rows: [sharedRuns[0]] }
        }
        return { rows: [] }
      },
    }),
  })

  const [a, b] = await Promise.all([
    repository.claim({ workerId: 'worker-a', limit: 1 }),
    repository.claim({ workerId: 'worker-b', limit: 1 }),
  ])
  assert.equal(a[0].id, 'run-1')
  assert.equal(b[0].id, 'run-2')
})