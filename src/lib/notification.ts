/**
 * 浏览器原生 Notification API 封装
 * - 仅在 H5(浏览器)环境有意义,小程序侧会被静默忽略
 * - 用户首次需要主动授权,失败后 in-app 提示作为降级
 */

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

let _permissionRequested = false

export function getNotificationPermission(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PermissionState
}

/** 主动请求一次授权(只请求一次,不会重复弹) */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  if (_permissionRequested) return getNotificationPermission()
  _permissionRequested = true
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const r = await Notification.requestPermission()
    return r as PermissionState
  } catch {
    return 'denied'
  }
}

interface NotifyOptions {
  title: string
  body: string
  /** 点击通知时跳转的 URL(H5 用 location.href) */
  url?: string
  /** 通知 tag — 同一 tag 不会叠多条 */
  tag?: string
  /** 自动关闭毫秒,默认 8000 */
  autoCloseMs?: number
}

export function notify(opts: NotifyOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/favicon.ico',
      requireInteraction: false,
    })
    if (opts.url) {
      n.onclick = () => {
        window.focus()
        window.location.href = opts.url!
        n.close()
      }
    }
    if (opts.autoCloseMs && opts.autoCloseMs > 0) {
      setTimeout(() => n.close(), opts.autoCloseMs)
    }
  } catch {
    /* 静默 — 后台/某些浏览器会抛 */
  }
}
