import assert from 'node:assert/strict'
import test from 'node:test'
import { buildModelCatalog, loadProviderConfig } from './provider-config'

test('enables MiniMax Coding Plan in production using only selected credentials', () => {
  const config = loadProviderConfig({
    NODE_ENV: 'production',
    MINIMAX_CREDENTIAL_MODE: 'coding_plan',
    MINIMAX_CODING_PLAN_API_KEY: 'coding-secret',
    MINIMAX_CODING_PLAN_BASE_URL: 'https://api.minimax.example/v1',
    MINIMAX_API_KEY: 'unused-secret',
    MINIMAX_BASE_URL: 'https://unused.example/v1',
    AGENT_MINIMAX_MODEL: 'MiniMax-M2.5',
  })

  assert.equal(config.minimax.enabled, true)
  assert.equal(config.minimax.credentialMode, 'coding_plan')
  assert.equal(config.minimax.apiKey, 'coding-secret')
  assert.equal(config.minimax.baseURL, 'https://api.minimax.example/v1')

  const catalog = buildModelCatalog(config, {})
  assert.equal(catalog[0].label, 'MiniMax-M2.5 · Coding Plan')
  assert.doesNotMatch(JSON.stringify(catalog), /secret|baseURL|example\/v1/)
})

test('marks a provider unavailable when selected credentials are incomplete', () => {
  const config = loadProviderConfig({
    MINIMAX_CREDENTIAL_MODE: 'api',
    MINIMAX_API_KEY: '',
    MINIMAX_BASE_URL: '',
    AGENT_MINIMAX_MODEL: 'MiniMax-M2.5',
  })
  const option = buildModelCatalog(config, {}).find((item) => item.provider === 'minimax')

  assert.equal(config.minimax.enabled, false)
  assert.equal(option?.available, false)
  assert.match(option?.unavailableReason ?? '', /未配置/)
})

test('rejects an unknown MiniMax credential mode without exposing its value', () => {
  assert.throws(
    () => loadProviderConfig({ MINIMAX_CREDENTIAL_MODE: 'mystery' }),
    /MINIMAX_CREDENTIAL_MODE 配置无效/,
  )
})
