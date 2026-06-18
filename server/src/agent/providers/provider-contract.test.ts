import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentModelProvider, AgentProviderRequest } from './provider.types'
import { PROVIDER_HEALTH_STATUSES } from './provider.types'

test('provider contract carries neutral messages, tools and cancellation', async () => {
  assert.deepEqual(PROVIDER_HEALTH_STATUSES, ['checking', 'available', 'unavailable', 'rate_limited'])
  const controller = new AbortController()
  const request: AgentProviderRequest = {
    model: 'model-1',
    messages: [{ role: 'user', content: '分析这只股票' }],
    tools: [{ name: 'get_stock_profile', description: '读取股票资料', inputSchema: { type: 'object' } }],
    signal: controller.signal,
    traceId: 'trace-1',
  }
  const provider: AgentModelProvider = {
    provider: 'deepseek',
    generate: async (input) => ({
      content: input.messages[0].content,
      toolCalls: [],
      citations: [],
      providerMetadata: { traceId: input.traceId },
    }),
    checkHealth: async () => ({ status: 'available', reason: null, retryAfter: null, checkedAt: '2026-06-18T10:00:00.000Z' }),
  }

  const result = await provider.generate(request)
  assert.equal(result.content, '分析这只股票')
  assert.deepEqual(result.providerMetadata, { traceId: 'trace-1' })
  assert.equal((await provider.checkHealth()).status, 'available')
})
