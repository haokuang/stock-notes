import Taro from '@tarojs/taro'
import { sessionEvents } from './session-events'

/**
 * 持久化 session 到 Taro storage(H5 走 localStorage,小程序走 wx.setStorageSync)
 * 字段:
 *   - access_token  短 JWT,每次请求带
 *   - refresh_token access token 过期时换取新 session
 *   - user_id / email 给前端展示用
 */
const KEYS = {
  access: 'auth.access_token',
  refresh: 'auth.refresh_token',
  user: 'auth.user',
} as const

export interface SessionUser {
  id: string
  email: string
}

export interface Session {
  access_token: string
  refresh_token: string
  user: SessionUser
}

export const sessionStore = {
  get(): Session | null {
    try {
      const access = Taro.getStorageSync(KEYS.access)
      if (!access) return null
      const refresh = Taro.getStorageSync(KEYS.refresh) || ''
      const user = Taro.getStorageSync(KEYS.user) || null
      return { access_token: access, refresh_token: refresh, user }
    } catch {
      return null
    }
  },

  set(s: Session) {
    Taro.setStorageSync(KEYS.access, s.access_token)
    Taro.setStorageSync(KEYS.refresh, s.refresh_token)
    Taro.setStorageSync(KEYS.user, s.user)
    sessionEvents.emit(s.access_token)
  },

  clear() {
    try {
      Taro.removeStorageSync(KEYS.access)
      Taro.removeStorageSync(KEYS.refresh)
      Taro.removeStorageSync(KEYS.user)
    } catch {}
    sessionEvents.emit(null)
  },

  getAccessToken(): string | null {
    try {
      return Taro.getStorageSync(KEYS.access) || null
    } catch {
      return null
    }
  },
}
