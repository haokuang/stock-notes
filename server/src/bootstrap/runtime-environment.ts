import { config as loadEnvFile } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function resolveDefaultLocalEnvPath(): string {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../.env.local'),
    resolve(__dirname, '../../.env.local'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

export function loadRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  envPath = resolveDefaultLocalEnvPath(),
): void {
  loadEnvFile({
    path: envPath,
    processEnv: env as Record<string, string>,
    override: false,
    quiet: true,
  })
}

export function validateProductionServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return

  const missing: string[] = []
  if (!env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL')
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!env.SUPABASE_DB_PASSWORD?.trim() && !env.SUPABASE_DB_URL?.trim()) {
    missing.push('SUPABASE_DB_PASSWORD or SUPABASE_DB_URL')
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    )
  }
}
