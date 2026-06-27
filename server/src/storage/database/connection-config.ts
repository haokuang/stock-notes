import type { PoolConfig } from 'pg'

type DbConnectionProfile = 'direct' | 'pooler-transaction' | 'pooler-session'

interface DbConnectionConfig {
  host: string
  port: number
  user: string
  database: string
  ssl: boolean
}

const PROJECT_REF = 'hgpxchebcipynrfjssiq'
const DB_USER = `postgres.${PROJECT_REF}`
const DB_NAME = 'postgres'

const PROFILES: Record<DbConnectionProfile, DbConnectionConfig> = {
  'pooler-transaction': {
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    user: DB_USER,
    database: DB_NAME,
    ssl: true,
  },
  'pooler-session': {
    host: 'aws-1-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    user: DB_USER,
    database: DB_NAME,
    ssl: true,
  },
  direct: {
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
    database: DB_NAME,
    ssl: true,
  },
}

function resolveProfile(env: NodeJS.ProcessEnv): DbConnectionConfig {
  const profile = (env.DB_CONNECTION_PROFILE ?? 'pooler-transaction') as DbConnectionProfile
  const config = PROFILES[profile]

  if (!config) {
    throw new Error(
      `Unknown DB_CONNECTION_PROFILE="${profile}". Valid: ${Object.keys(PROFILES).join(', ')}`,
    )
  }

  return config
}

function buildConnectionString(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL?.trim()
  if (databaseUrl) return databaseUrl

  const explicitSupabaseUrl = env.SUPABASE_DB_URL?.trim()
  if (explicitSupabaseUrl) return explicitSupabaseUrl

  const password = env.SUPABASE_DB_PASSWORD?.trim()
  if (password) {
    const config = resolveProfile(env)
    const ssl = config.ssl ? '?sslmode=no-verify' : ''
    return `postgresql://${config.user}:${encodeURIComponent(password)}@${config.host}:${config.port}/${config.database}${ssl}`
  }

  throw new Error(
    'Database credentials not configured. Set DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_DB_PASSWORD.',
  )
}

function resolveSsl(env: NodeJS.ProcessEnv): PoolConfig['ssl'] {
  const value = env.DATABASE_SSL?.trim().toLowerCase()
  if (!value) return { rejectUnauthorized: false }
  if (['false', '0', 'no', 'off', 'disable', 'disabled'].includes(value)) return false
  if (['true', '1', 'yes', 'on', 'require', 'required'].includes(value)) {
    return { rejectUnauthorized: false }
  }
  throw new Error(
    'Invalid DATABASE_SSL value. Use true/false, require, or disable.',
  )
}

export function createDatabasePoolConfig(
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  return {
    connectionString: buildConnectionString(env),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: resolveSsl(env),
  }
}
