import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeProviderError } from './provider-error'

const cases = [
  [{ status: 401, message: 'secret upstream body' }, 'PROVIDER_AUTH_FAILED', false],
  [{ status: 403 }, 'PROVIDER_AUTH_FAILED', false],
  [{ status: 429, headers: { 'retry-after': '45' } }, 'PROVIDER_RATE_LIMITED', false],
  [{ status: 400 }, 'PROVIDER_INVALID_REQUEST', false],
  [{ status: 503 }, 'PROVIDER_TEMPORARY_FAILURE', true],
] as const

for (const [input, code, retryable] of cases) {
  test(`maps upstream status to ${code}`, () => {
    const error = normalizeProviderError('minimax', input)
    assert.equal(error.code, code)
    assert.equal(error.retryable, retryable)
    assert.doesNotMatch(error.safeMessage, /secret upstream body/)
  })
}

test('maps quota text separately from ordinary rate limiting', () => {
  const error = normalizeProviderError('openai', { status: 429, code: 'insufficient_quota' })
  assert.equal(error.code, 'PROVIDER_QUOTA_EXHAUSTED')
  assert.equal(error.retryable, false)
})

test('maps abort and network failures without exposing raw messages', () => {
  const timeout = normalizeProviderError('deepseek', { name: 'AbortError', message: 'raw timeout' })
  assert.equal(timeout.code, 'PROVIDER_TIMEOUT')
  assert.equal(timeout.retryable, true)

  const network = normalizeProviderError('deepseek', new TypeError('socket secret'))
  assert.equal(network.code, 'PROVIDER_TEMPORARY_FAILURE')
  assert.doesNotMatch(network.safeMessage, /socket secret/)
})
