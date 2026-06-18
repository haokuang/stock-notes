import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenAICompatibleProvider } from './openai-compatible'
import { ProviderRegistry } from './provider-registry'

function request() {
  return {
    model: 'model-1',
    messages: [{ role: 'user' as const, content: '分析' }],
    tools: [{ name: 'get_stock_profile', description: '资料', inputSchema: { type: 'object' } }],
    signal: new AbortController().signal,
    traceId: 'trace-1',
  }
}

test('maps text, tool calls and safe metadata from an OpenAI-compatible response', async () => {
  const client = {
    chat: { completions: { create: async () => ({
      id: 'response-1',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [{ message: {
        content: '需要资料',
        tool_calls: [{ id: 'call-1', function: { name: 'get_stock_profile', arguments: '{}' } }],
      } }],
    }) } },
  }
  const provider = new OpenAICompatibleProvider('deepseek', client as never, 'model-1')

  const result = await provider.generate(request())

  assert.equal(result.content, '需要资料')
  assert.deepEqual(result.toolCalls, [{ id: 'call-1', name: 'get_stock_profile', arguments: {} }])
  assert.deepEqual(result.providerMetadata, {
    responseId: 'response-1',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  })
})

test('rejects malformed tool arguments as an invalid request', async () => {
  const client = { chat: { completions: { create: async () => ({
    id: 'response-1',
    choices: [{ message: { content: '', tool_calls: [{ id: 'call-1', function: { name: 'tool', arguments: '{' } }] } }],
  }) } } }
  const provider = new OpenAICompatibleProvider('minimax', client as never, 'model-1')
  await assert.rejects(provider.generate(request()), (error: { code?: string }) => error.code === 'PROVIDER_INVALID_REQUEST')
})

test('registry never falls back after the selected provider fails', async () => {
  let fallbackCalls = 0
  const selected = { provider: 'deepseek' as const, generate: async () => { throw new Error('failed') }, checkHealth: async () => ({ status: 'unavailable' as const, reason: 'failed', retryAfter: null, checkedAt: '' }) }
  const fallback = { provider: 'openai' as const, generate: async () => { fallbackCalls += 1; throw new Error() }, checkHealth: async () => ({ status: 'available' as const, reason: null, retryAfter: null, checkedAt: '' }) }
  const registry = new ProviderRegistry([selected, fallback])

  await assert.rejects(registry.get('deepseek').generate(request()))
  assert.equal(fallbackCalls, 0)
})
