import assert from 'node:assert/strict'
import test from 'node:test'
import { MANAGED_KEYS, mergeEnvText, parseEnvText } from './switch-supabase-profile.mjs'

test('parseEnvText reads simple env files without exposing comments', () => {
  assert.deepEqual(parseEnvText('A=1\n# ignored\nB=\"two\"\nC=three=four\n'), {
    A: '1',
    B: 'two',
    C: 'three=four',
  })
})

test('mergeEnvText replaces managed keys and clears stale managed keys', () => {
  const current = [
    'APP_ENV=development',
    'SUPABASE_URL=https://old.example',
    'SUPABASE_DB_URL=postgresql://old',
    'DATABASE_SSL=false',
    'OTHER=value',
  ].join('\n')
  const profile = {
    SUPABASE_URL: 'https://new.example',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    DATABASE_SSL: 'true',
  }

  const merged = mergeEnvText(current, profile)

  assert.match(merged, /APP_ENV=development/)
  assert.match(merged, /OTHER=value/)
  assert.match(merged, /SUPABASE_URL=https:\/\/new\.example/)
  assert.match(merged, /SUPABASE_ANON_KEY=anon/)
  assert.match(merged, /SUPABASE_SERVICE_ROLE_KEY=service/)
  assert.match(merged, /SUPABASE_DB_URL=\n/)
  assert.match(merged, /DATABASE_SSL=true/)
})

test('managed key list includes all active Supabase connection switches', () => {
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'SUPABASE_DB_URL',
    'SUPABASE_DB_PASSWORD',
    'DATABASE_SSL',
    'DB_CONNECTION_PROFILE',
  ]) {
    assert.ok(MANAGED_KEYS.includes(key), key)
  }
})
