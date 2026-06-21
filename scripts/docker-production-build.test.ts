import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const script = resolve(process.cwd(), 'scripts/docker-production-build.mjs')

function createFakeDocker(directory: string): { bin: string; log: string } {
  const bin = join(directory, 'bin')
  const log = join(directory, 'docker.log')
  const docker = join(bin, 'docker')
  mkdirSync(bin)
  writeFileSync(
    docker,
    '#!/bin/sh\nprintf "%s|%s|%s\\n" "$SUPABASE_URL" "$SUPABASE_ANON_KEY" "$*" >> "$DOCKER_LOG"\n',
  )
  chmodSync(docker, 0o755)
  return { bin, log }
}

test('loads public build variables from .env.production without exposing values in docker arguments', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-notes-docker-build-'))
  const { bin, log } = createFakeDocker(directory)
  writeFileSync(
    join(directory, '.env.production'),
    'SUPABASE_URL=https://project.supabase.co\nSUPABASE_ANON_KEY=public-anon-key\n',
  )

  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      DOCKER_LOG: log,
    },
  })

  assert.equal(result.status, 0, result.stderr)
  const lines = readFileSync(log, 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^https:\/\/project\.supabase\.co\|public-anon-key\|build /)
  assert.match(lines[0], /--target server-runtime/)
  assert.match(lines[1], /--target web-runtime/)
  assert.match(lines[1], /--build-arg SUPABASE_URL(?:\s|$)/)
  assert.match(lines[1], /--build-arg SUPABASE_ANON_KEY(?:\s|$)/)
  assert.doesNotMatch(lines[1].split('|')[2], /public-anon-key/)
})

test('keeps explicitly injected public build variables over file values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-notes-docker-build-'))
  const { bin, log } = createFakeDocker(directory)
  writeFileSync(
    join(directory, '.env.production'),
    'SUPABASE_URL=https://file.supabase.co\nSUPABASE_ANON_KEY=file-key\n',
  )

  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      DOCKER_LOG: log,
      SUPABASE_URL: 'https://injected.supabase.co',
      SUPABASE_ANON_KEY: 'injected-key',
    },
  })

  assert.equal(result.status, 0, result.stderr)
  const lines = readFileSync(log, 'utf8')
  assert.match(lines, /https:\/\/injected\.supabase\.co\|injected-key\|/)
  assert.doesNotMatch(lines, /file-key/)
})

test('fails clearly when .env.production is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-notes-docker-build-'))
  const result = spawnSync(process.execPath, [script], {
    cwd: directory,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /\.env\.production/)
})
