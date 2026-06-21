import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

const envPath = resolve(process.cwd(), '.env.production')

if (!existsSync(envPath)) {
  console.error('Missing .env.production. Copy .env.production.example and fill the required values.')
  process.exit(1)
}

config({ path: envPath, override: false, quiet: true })

const requiredPublicVariables = ['SUPABASE_URL', 'SUPABASE_ANON_KEY']
const missing = requiredPublicVariables.filter((name) => !process.env[name]?.trim())

if (missing.length > 0) {
  console.error(`Missing required production build variables: ${missing.join(', ')}`)
  process.exit(1)
}

function runDocker(args) {
  const result = spawnSync('docker', args, {
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`Unable to start Docker: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const commonArgs = ['build', '--platform=linux/amd64', '-f', 'Dockerfile']

runDocker([
  ...commonArgs,
  '--target',
  'server-runtime',
  '-t',
  'codex-docker-runtime-server:amd64',
  '.',
])

runDocker([
  ...commonArgs,
  '--target',
  'web-runtime',
  '-t',
  'codex-docker-runtime-web:amd64',
  '--build-arg',
  'SUPABASE_URL',
  '--build-arg',
  'SUPABASE_ANON_KEY',
  '.',
])
