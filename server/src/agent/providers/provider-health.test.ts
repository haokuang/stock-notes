import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentProvider } from '../agent.types'
import type { ProviderHealth } from './provider.types'
import { ProviderHealthService } from './provider-health.service'

function makeProbe(provider: AgentProvider, sequence: ProviderHealth[]) {
  const calls: AgentProvider[] = []
  let idx = 0
  return {
    calls,
    probe: async (p: AgentProvider): Promise<ProviderHealth> => {
      calls.push(p)
      // Defer at least one real tick so callers that fire-and-forget do not
      // observe a resolved state on the same microtask burst.
      await new Promise<void>((resolve) => setImmediate(resolve))
      const next = sequence[idx] ?? sequence[sequence.length - 1]
      idx += 1
      return next
    },
  }
}

function passthroughLogger() {
  return { log: () => undefined, warn: () => undefined, error: () => undefined }
}

function makeFakeClock() {
  let now = 0
  return {
    now: () => now,
    setNow(value: number) {
      now = value
    },
  }
}

test('init returns immediately with MiniMax in checking state', async () => {
  const probe = makeProbe('minimax', [{ status: 'available', reason: null, retryAfter: null, checkedAt: 't1' }])
  const clock = makeFakeClock()
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: probe.probe,
    logger: passthroughLogger(),
    now: clock.now,
  })

  const start = Date.now()
  await service.onModuleInit()
  const elapsed = Date.now() - start
  assert.ok(elapsed < 50, `init awaited the probe (${elapsed}ms)`)
  assert.deepEqual(service.getHealth('minimax'), {
    status: 'checking',
    reason: null,
    retryAfter: null,
    checkedAt: '',
  })
})

test('successful probe transitions MiniMax to available', async () => {
  const clock = makeFakeClock()
  clock.setNow(1000)
  const probe = makeProbe('minimax', [{ status: 'available', reason: null, retryAfter: null, checkedAt: 'iso-1' }])
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: probe.probe,
    logger: passthroughLogger(),
    now: clock.now,
  })

  await service.onModuleInit()
  await service.refresh('minimax')

  const health = service.getHealth('minimax')
  assert.equal(health.status, 'available')
  assert.equal(health.reason, null)
})

test('401 surfaces as unavailable with safe reason only', async () => {
  const probe = makeProbe('minimax', [{
    status: 'unavailable',
    reason: '模型鉴权失败，请联系管理员',
    retryAfter: null,
    checkedAt: 'iso-2',
  }])
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: probe.probe,
    logger: passthroughLogger(),
    now: () => 0,
  })

  await service.refresh('minimax')

  const health = service.getHealth('minimax')
  assert.equal(health.status, 'unavailable')
  assert.equal(health.reason, '模型鉴权失败，请联系管理员')
})

test('429 surfaces as rate_limited with retryAfter', async () => {
  const probe = makeProbe('minimax', [{
    status: 'rate_limited',
    reason: '模型请求过于频繁，请稍后重试',
    retryAfter: 60,
    checkedAt: 'iso-3',
  }])
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: probe.probe,
    logger: passthroughLogger(),
    now: () => 0,
  })

  await service.refresh('minimax')

  const health = service.getHealth('minimax')
  assert.equal(health.status, 'rate_limited')
  assert.equal(health.retryAfter, 60)
})

test('later success clears a prior error state', async () => {
  const probe = makeProbe('minimax', [
    { status: 'rate_limited', reason: 'busy', retryAfter: 30, checkedAt: 'iso-4' },
    { status: 'available', reason: null, retryAfter: null, checkedAt: 'iso-5' },
  ])
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: probe.probe,
    logger: passthroughLogger(),
    now: () => 0,
  })

  await service.refresh('minimax')
  assert.equal(service.getHealth('minimax').status, 'rate_limited')

  await service.refresh('minimax')
  const health = service.getHealth('minimax')
  assert.equal(health.status, 'available')
  assert.equal(health.reason, null)
  assert.equal(health.retryAfter, null)
})

test('unknown provider yields unavailable with default reason', () => {
  const service = new ProviderHealthService({
    providers: new Set(['minimax']),
    probe: async () => ({ status: 'available', reason: null, retryAfter: null, checkedAt: '' }),
    logger: passthroughLogger(),
    now: () => 0,
  })

  const health = service.getHealth('deepseek' as AgentProvider)
  assert.equal(health.status, 'unavailable')
  assert.equal(health.reason, '模型当前未配置')
})