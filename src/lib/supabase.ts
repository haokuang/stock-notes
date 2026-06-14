import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 客户端工厂(前端专用)
 * - 只用 anon key(从 Taro defineConstants 注入,build-time 替换为字符串字面量)
 * - 严禁 service_role 进前端 bundle — 一旦泄露,任何人都能绕过 RLS
 * - 当前只用于 Realtime 订阅(postgres_changes),不直接读 / 写表
 */

// Taro compile-time 注入的全局常量(config/index.ts defineConstants)
declare const SUPABASE_URL: string
declare const SUPABASE_ANON_KEY: string

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client

  // 兜底:开发期 .env.local 没填,直连跑得起来
  const url = SUPABASE_URL || 'https://hgpxchebcipynrfjssiq.supabase.co'
  const anonKey = SUPABASE_ANON_KEY || 'sb_publishable_TXYFJXtnyLn6drvp9YFXDg_AIV03vLE'

  _client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 10 },  // 限速:10 事件 / 秒
    },
  })
  return _client
}
