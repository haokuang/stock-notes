import { Module, Global, Logger } from '@nestjs/common'
import { Pool, PoolConfig } from 'pg'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as schema from './shared/schema'

export const DRIZZLE_DB = 'DRIZZLE_DB'
export const SUPABASE_CLIENT = 'SUPABASE_CLIENT'
export const PG_POOL = 'PG_POOL'

/**
 * 数据库连接池 — 直接连 Supabase Postgres (5432 直连)
 * 同时暴露一个 SupabaseClient(auth 用),无需再次从环境读 URL/key
 *
 * 连接拆成"写死 + 密码"两部分:
 * - host/user/database 写死(项目是公开的 supabase ref)
 * - password 走 SUPABASE_DB_PASSWORD(也兼容老的 SUPABASE_DB_URL,优先级更高)
 *
 * 想要换 region/模式(直连 vs pooler vs session)改 DB_CONNECTION_PROFILE 即可
 */
type DbConnectionProfile = 'direct' | 'pooler-transaction' | 'pooler-session'

interface DbConnectionConfig {
  host: string
  port: number
  user: string
  database: string
  // pooler 模式需要 SSL
  ssl: boolean
}

const PROJECT_REF = 'hgpxchebcipynrfjssiq'
const DB_USER = `postgres.${PROJECT_REF}`
const DB_NAME = 'postgres'

const PROFILES: Record<DbConnectionProfile, DbConnectionConfig> = {
  // 默认走 transaction pooler(IPv4,适合 serverless/短连接 + 本地 IPv6 不通的环境)
  'pooler-transaction': {
    host: `aws-1-ap-northeast-1.pooler.supabase.com`,
    port: 6543,
    user: DB_USER,
    database: DB_NAME,
    ssl: true,
  },
  'pooler-session': {
    host: `aws-1-ap-northeast-1.pooler.supabase.com`,
    port: 5432,
    user: DB_USER,
    database: DB_NAME,
    ssl: true,
  },
  // 直连 db 主机(仅 Supabase IPv4 add-on 开通后才用得上,默认 IPv6-only)
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
  const cfg = PROFILES[profile]
  if (!cfg) {
    throw new Error(
      `Unknown DB_CONNECTION_PROFILE="${profile}". Valid: ${Object.keys(PROFILES).join(', ')}`,
    )
  }
  return cfg
}

function resolvePassword(env: NodeJS.ProcessEnv): string {
  // 优先级: 显式 password > 完整 URL(老方式,向后兼容) > 空(抛错)
  const explicit = env.SUPABASE_DB_PASSWORD?.trim()
  if (explicit) return explicit
  const legacy = env.SUPABASE_DB_URL?.trim()
  if (legacy) return legacy
  throw new Error(
    'Database password not configured. Set SUPABASE_DB_PASSWORD (recommended) or SUPABASE_DB_PASSWORD (legacy).',
  )
}

function buildConnectionString(): string {
  const cfg = resolveProfile(process.env)
  const password = resolvePassword(process.env)
  // 用 sslmode=no-verify 而不是 require — Supabase pooler 是自签证书,
  // node pg 在 strict 模式下会拒绝;由下方 Pool 的 ssl.rejectUnauthorized=false 实际控制
  const ssl = cfg.ssl ? '?sslmode=no-verify' : ''
  return `postgresql://${cfg.user}:${encodeURIComponent(password)}@${cfg.host}:${cfg.port}/${cfg.database}${ssl}`
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const logger = new Logger('DatabaseModule')
        const url = buildConnectionString()
        logger.log('Creating pg pool…')
        const poolConfig: PoolConfig = {
          connectionString: url,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          // Supabase / pgbouncer 走自签证书,本地开发关闭校验
          // (生产环境如果想严格校验,改用环境变量传入 CA bundle)
          ssl: { rejectUnauthorized: false },
        }
        return new Pool(poolConfig)
      },
    },
    {
      provide: DRIZZLE_DB,
      inject: [PG_POOL],
      useFactory: async (pool: Pool): Promise<NodePgDatabase<typeof schema>> => {
        const logger = new Logger('DatabaseModule')
        const client = await pool.connect()
        try {
          const { rows } = await client.query<{ now: string }>('SELECT now()')
          logger.log(`✓ Database connected (server time: ${rows[0].now})`)
        } finally {
          client.release()
        }
        return drizzle(pool, { schema })
      },
    },
    {
      provide: SUPABASE_CLIENT,
      useFactory: (): SupabaseClient => {
        const url = process.env.SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !serviceKey) {
          throw new Error(
            'Supabase env not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
          )
        }
        return createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      },
    },
  ],
  exports: [DRIZZLE_DB, SUPABASE_CLIENT, PG_POOL],
})
export class DatabaseModule {}
