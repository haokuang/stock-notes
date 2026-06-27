import { config as loadEnvFile } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function resolveDefaultLocalEnvPath(): string {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env.local'),
    resolve(process.cwd(), '../.env'),
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../../.env'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function resolveEnvFallbackPath(): string | undefined {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(__dirname, '../../.env'),
  ]
  return candidates.find((candidate) => existsSync(candidate))
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
  // 兜底：如果主路径(.env.local 或 .env)读不到 DB 凭据，再尝试 .env
  if (!env.SUPABASE_DB_PASSWORD?.trim() && !env.SUPABASE_DB_URL?.trim()) {
    const fallback = resolveEnvFallbackPath()
    if (fallback && fallback !== envPath) {
      loadEnvFile({
        path: fallback,
        processEnv: env as Record<string, string>,
        override: false,
        quiet: true,
      })
    }
  }
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
  if (!env.SUPABASE_ANON_KEY?.trim()) missing.push('SUPABASE_ANON_KEY')
  if (
    !env.DATABASE_URL?.trim()
    && !env.SUPABASE_DB_URL?.trim()
    && !env.SUPABASE_DB_PASSWORD?.trim()
  ) {
    missing.push('DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD')
  }
  if (!env.WECHAT_APPID?.trim()) missing.push('WECHAT_APPID')
  if (!env.WECHAT_SECRET?.trim()) missing.push('WECHAT_SECRET')

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    )
  }
}
