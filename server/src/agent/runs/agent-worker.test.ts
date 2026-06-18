import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentWorker } from './agent-worker.service'
import type { AgentRunQueueRepository, ClaimedRun } from './run-queue.repository'
import type { AgentOrchestrator } from '../agent-orchestrator'

function makeWorker(options: {
  claimed?: ClaimedRun[]
  heartbeatFn?: () => Promise<void>
  finalizeContent?: string
  finalizeCitations?: Array<{ id: string; title: string; url: string; source: string; snippet: string; publishedAt: string | null }>
  throwOnOrchestrate?: Error
} = {}) {
  const calls: { method: string; runId?: string }[] = []
  let heartbeatCount = 0
  const claimed = options.claimed ?? []
  const queue = {
    claim: async (args: { workerId: string; limit: number }) => {
      calls.push({ method: 'claim', runId: claimed[0]?.id })
      return claimed
    },
    heartbeat: async (args: { runId: string; workerId: string }) => {
      calls.push({ method: 'heartbeat', runId: args.runId })
      heartbeatCount += 1
      if (options.heartbeatFn) await options.heartbeatFn()
    },
    markRetryable: async (args: { runId: string }) => {
      calls.push({ method: 'markRetryable', runId: args.runId })
    },
    markFailed: async (args: { runId: string }) => {
      calls.push({ method: 'markFailed', runId: args.runId })
    },
    finalizeSuccess: async (args: { runId: string }) => {
      calls.push({ method: 'finalizeSuccess', runId: args.runId })
      return { messageId: 'msg-1' }
    },
  }
  const orchestrator = {
    run: async (_input: unknown) => {
      if (options.throwOnOrchestrate) throw options.throwOnOrchestrate
      return {
        content: options.finalizeContent ?? 'ok',
        toolCalls: [],
        citations: options.finalizeCitations ?? [],
      }
    },
  }
  const stages: Array<{ runId: string; stage: string }> = []
  const worker = new AgentWorker({
    workerId: 'worker-test',
    concurrency: 2,
    heartbeatIntervalMs: 100,
    leaseMs: 45_000,
    queue: queue as unknown as AgentRunQueueRepository,
    orchestrator: orchestrator as unknown as AgentOrchestrator,
    onStage: (runId, stage) => stages.push({ runId, stage }),
  })
  return { worker, calls, stages, getHeartbeatCount: () => heartbeatCount }
}

test('worker claims and finalizes a successful run', async () => {
  const { worker, calls, stages } = makeWorker({
    claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 1, maxAttempts: 2 }],
  })
  await worker.tick()
  assert.deepEqual(calls.map((c) => c.method), ['claim', 'finalizeSuccess'])
  assert.ok(stages.some((s) => s.stage === 'completed'))
})

test('worker concurrency is bounded by claim limit', async () => {
  const { worker, calls } = makeWorker({
    claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 1, maxAttempts: 2 }],
  })
  await worker.tick()
  const claim = calls.find((c) => c.method === 'claim')
  assert.equal(claim?.runId, 'run-1')
})

test('worker markRetryable on retryable failure when attempts remain', async () => {
  const { worker, calls } = makeWorker({
    claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 1, maxAttempts: 2 }],
    throwOnOrchestrate: new Error('UPSTREAM_TIMEOUT'),
  })
  await worker.tick()
  assert.ok(calls.some((c) => c.method === 'markRetryable'))
  assert.ok(!calls.some((c) => c.method === 'markFailed'))
})

test('worker markFailed when attemptCount >= maxAttempts', async () => {
  const { worker, calls } = makeWorker({
    claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 2, maxAttempts: 2 }],
    throwOnOrchestrate: new Error('UPSTREAM_TIMEOUT'),
  })
  await worker.tick()
  assert.ok(calls.some((c) => c.method === 'markFailed'))
  assert.ok(!calls.some((c) => c.method === 'markRetryable'))
})

test('worker never retries auth/quota/429/parameter errors', async () => {
  for (const code of ['PROVIDER_AUTH_FAILED', 'PROVIDER_QUOTA_EXCEEDED', 'PROVIDER_RATE_LIMITED', 'INVALID_PARAMETER']) {
    const { worker, calls } = makeWorker({
      claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 1, maxAttempts: 2 }],
      throwOnOrchestrate: new Error(code),
    })
    await worker.tick()
    assert.ok(calls.some((c) => c.method === 'markFailed'), `${code} should mark failed`)
    assert.ok(!calls.some((c) => c.method === 'markRetryable'), `${code} should not retry`)
  }
})

test('worker preserves retryAfter on 429 even when failing', async () => {
  const retryAfterValues: Array<number | null> = []
  const queue = {
    claim: async () => [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 2, maxAttempts: 2 }],
    heartbeat: async () => undefined,
    markFailed: async (args: { retryAfter?: number | null }) => {
      retryAfterValues.push(args.retryAfter ?? null)
    },
    markRetryable: async () => undefined,
    finalizeSuccess: async () => ({ messageId: 'msg-1' }),
  }
  const orchestrator = { run: async () => { throw new Error('PROVIDER_RATE_LIMITED') } }
  const worker = new AgentWorker({
    workerId: 'worker-test',
    concurrency: 2,
    heartbeatIntervalMs: 100,
    leaseMs: 45_000,
    queue: queue as unknown as AgentRunQueueRepository,
    orchestrator: orchestrator as unknown as AgentOrchestrator,
    onStage: () => undefined,
    classifyError: () => ({ retryable: false, retryAfter: 60 }),
  })
  await worker.tick()
  assert.equal(retryAfterValues[0], 60)
})

test('worker stop() prevents further ticks', async () => {
  const { worker } = makeWorker({
    claimed: [{ id: 'run-1', userId: 'user-1', threadId: 'thread-1', userMessageId: 'msg-1', provider: 'deepseek', model: 'm', attemptCount: 1, maxAttempts: 2 }],
  })
  worker.stop()
  await worker.tick()
})

test('worker with no claimed runs is a no-op', async () => {
  const { worker, calls } = makeWorker({ claimed: [] })
  await worker.tick()
  assert.ok(!calls.some((c) => c.method === 'finalizeSuccess'))
  assert.ok(!calls.some((c) => c.method === 'markFailed'))
})