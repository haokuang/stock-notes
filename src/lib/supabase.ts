import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sessionEvents } from '../auth/session-events'
import { sessionStore } from '../auth/session'
import { syncRealtimeAuth } from './realtime-auth'

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
let _sessionSyncBound = false

export function getSupabase(): SupabaseClient {
  if (_client) return _client

  const url = SUPABASE_URL
  const anonKey = SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase 客户端地址或匿名密钥未配置')
  }

  _client = createClient(url, anonKey, {
    accessToken: async () => sessionStore.getAccessToken(),
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 10 },  // 限速:10 事件 / 秒
    },
  })
  syncRealtimeAuth(_client.realtime, sessionStore.getAccessToken())
  if (!_sessionSyncBound) {
    sessionEvents.subscribe((accessToken) => {
      if (_client) syncRealtimeAuth(_client.realtime, accessToken)
    })
    _sessionSyncBound = true
  }
  return _client
}
