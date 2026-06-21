import { Module, Global, Logger } from '@nestjs/common'
import { Pool } from 'pg'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as schema from './shared/schema'
import { createDatabasePoolConfig } from './connection-config'

export const DRIZZLE_DB = 'DRIZZLE_DB'
export const SUPABASE_CLIENT = 'SUPABASE_CLIENT'
export const PG_POOL = 'PG_POOL'

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const logger = new Logger('DatabaseModule')
        logger.log('Creating pg pool…')
        return new Pool(createDatabasePoolConfig())
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
