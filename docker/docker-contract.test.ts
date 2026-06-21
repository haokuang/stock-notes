import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('Dockerfile provides development and minimal production targets', () => {
  const source = read('Dockerfile')
  for (const stage of [
    'development',
    'web-build',
    'web-runtime',
    'server-build',
    'server-runtime',
    'mini-build',
  ]) {
    assert.match(source, new RegExp(` AS ${stage}\\b`, 'i'))
  }
  assert.match(source, /pnpm install --frozen-lockfile/)
  assert.match(source, /USER node/)
  assert.match(source, /HEALTHCHECK/)
  assert.match(source, /validate-docker-env\.mjs web/)
})

test('Docker build context excludes secrets and generated artifacts', () => {
  const source = read('.dockerignore')
  for (const pattern of [
    '.env.local',
    '.env.production',
    'node_modules',
    'server/node_modules',
    'dist-web',
    'dist-tt',
    'server/dist',
    '.git',
  ]) {
    assert.ok(source.includes(pattern), `missing ${pattern}`)
  }
  assert.match(source, /!\.env\.production\.example/)
})

test('development compose exposes hot-reload web and server services', () => {
  const source = read('docker-compose.dev.yml')
  assert.match(source, /web-dev:/)
  assert.match(source, /server-dev:/)
  assert.match(source, /"5001:5001"/)
  assert.match(source, /"3000:3000"/)
  assert.match(source, /H5_PROXY_TARGET: http:\/\/server-dev:3000/)
  assert.match(source, /CHOKIDAR_USEPOLLING: "true"/)
  assert.match(source, /WATCHPACK_POLLING: "true"/)
  assert.match(source, /pnpm dev:web/)
  assert.match(source, /pnpm dev:server/)
})
