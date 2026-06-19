import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRuntimeService } from './agent-runtime.service'

test('runtime recovers expired runs and starts worker polling', async () => {
  let recovered = 0
  let ticks = 0
  let scheduled: (() => void) | null = null
  const runtime = new AgentRuntimeService({
    worker: { tick: async () => { ticks += 1 }, stop: () => undefined },
    recovery: { recoverOnce: async () => { recovered += 1; return { requeued: [], failed: [] } } },
    pollMs: 1000,
    setIntervalFn: (callback) => { scheduled = callback; return 1 as never },
    clearIntervalFn: () => undefined,
  })

  await runtime.onModuleInit()
  assert.equal(recovered, 1)
  assert.equal(ticks, 1)
  assert.ok(scheduled)
  ;(scheduled as () => void)()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(recovered, 2)
  assert.equal(ticks, 2)
  runtime.onModuleDestroy()
})
