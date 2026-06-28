import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  loadRuntimeEnvironment,
  validateProductionServerEnvironment,
} from './runtime-environment'

test('keeps injected values and fills missing values from a local env file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-notes-env-'))
  const envFile = join(directory, '.env.local')
  writeFileSync(envFile, 'SUPABASE_URL=https://file.example\nMINIMAX_CLI_PATH=mmx\n')
  const env: NodeJS.ProcessEnv = {
    SUPABASE_URL: 'https://injected.example',
  }

  loadRuntimeEnvironment(env, envFile)

  assert.equal(env.SUPABASE_URL, 'https://injected.example')
  assert.equal(env.MINIMAX_CLI_PATH, 'mmx')
})

test('production validation accepts password, Supabase URL, or generic database URL', () => {
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_DB_PASSWORD: 'password',
    WECHAT_APPID: 'wxxxxxxxx',
    WECHAT_SECRET: 'secret',
  }))
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_ANON_KEY: 'anon-key',
    DATABASE_URL: 'postgresql://example',
    WECHAT_APPID: 'wxxxxxxxx',
    WECHAT_SECRET: 'secret',
  }))
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_DB_URL: 'postgresql://example',
    WECHAT_APPID: 'wxxxxxxxx',
    WECHAT_SECRET: 'secret',
  }))
})

test('production validation lists missing names without printing secret values', () => {
  assert.throws(
    () => validateProductionServerEnvironment({
      NODE_ENV: 'production',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-appear',
    }),
    (error: Error) => {
      assert.match(error.message, /SUPABASE_URL/)
      assert.match(error.message, /SUPABASE_ANON_KEY/)
      assert.match(error.message, /WECHAT_APPID/)
      assert.match(error.message, /WECHAT_SECRET/)
      assert.match(error.message, /DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD/)
      assert.doesNotMatch(error.message, /must-not-appear/)
      return true
    },
  )
})

test('development does not require production variables', () => {
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'development',
  }))
})
