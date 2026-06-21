import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const script = resolve(process.cwd(), 'scripts/validate-docker-env.mjs')

function run(mode: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [script, mode], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  })
}

test('web mode requires public Supabase configuration', () => {
  const result = run('web', {})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /SUPABASE_URL/)
  assert.match(result.stderr, /SUPABASE_ANON_KEY/)
})

test('web mode accepts public Supabase configuration', () => {
  const result = run('web', {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('mini mode requires an HTTPS project domain', () => {
  const missing = run('mini', { PROJECT_DOMAIN: '' })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /PROJECT_DOMAIN/)

  const insecure = run('mini', { PROJECT_DOMAIN: 'http://localhost:3000' })
  assert.notEqual(insecure.status, 0)
  assert.match(insecure.stderr, /https/)

  const valid = run('mini', { PROJECT_DOMAIN: 'https://stock.test' })
  assert.equal(valid.status, 0, valid.stderr)
})
