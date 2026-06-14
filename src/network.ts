import Taro from '@tarojs/taro'
import { sessionStore } from './auth/session'

/**
 * 网络请求模块
 * 自动:
 *   1. 加 PROJECT_DOMAIN 前缀
 *   2. 从 session 注入 Authorization: Bearer <jwt>
 *   3. 401 响应时清掉 session(由调用方跳转登录)
 */
export namespace Network {
    const PUBLIC_PATHS = ['/api/auth/sign-in', '/api/auth/sign-up']

    const createUrl = (url: string): string => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url
        }
        return `${PROJECT_DOMAIN}${url}`
    }

    const injectAuth = (option: Taro.request.Option): Taro.request.Option => {
        const isPublic = PUBLIC_PATHS.some((p) => option.url.includes(p))
        if (isPublic) return option
        const token = sessionStore.getAccessToken()
        if (!token) return option
        return {
            ...option,
            header: {
                ...(option.header || {}),
                Authorization: `Bearer ${token}`,
            },
        }
    }

    /**
     * 401/403 时清 session + 跳登录页(只在非 /api/auth/* 响应)
     */
    const handleUnauthorized = (status: number, url: string) => {
        const isAuthEndpoint = PUBLIC_PATHS.some((p) => url.includes(p))
        if (isAuthEndpoint) return
        if (status === 401 || status === 403) {
            sessionStore.clear()
            // 跳登录页(用 redirectTo 避免在 tab 页面栈里留残)
            try {
                Taro.hideToast?.()
                Taro.showToast({ title: '请重新登录', icon: 'none' })
            } catch {}
            setTimeout(() => {
                try {
                    Taro.reLaunch({ url: '/pages/login/index' })
                } catch {}
            }, 800)
        }
    }

    export const request: typeof Taro.request = option => {
        const opt = injectAuth({ ...option, url: createUrl(option.url) })
        const task = Taro.request(opt) as any
        // 401 兜底:不影响请求本身的成功/失败,只做副作用
        const maybePromise = task?.then ? task : Promise.resolve(task)
        maybePromise.then((res: any) => {
            handleUnauthorized(res?.statusCode, option.url)
        })
        return task
    }

    export const uploadFile: typeof Taro.uploadFile = option => {
        return Taro.uploadFile({
            ...option,
            url: createUrl(option.url),
            header: {
                ...(option.header || {}),
                ...(sessionStore.getAccessToken()
                    ? { Authorization: `Bearer ${sessionStore.getAccessToken()}` }
                    : {}),
            },
        })
    }

    export const downloadFile: typeof Taro.downloadFile = option => {
        return Taro.downloadFile({
            ...option,
            url: createUrl(option.url),
            header: {
                ...(option.header || {}),
                ...(sessionStore.getAccessToken()
                    ? { Authorization: `Bearer ${sessionStore.getAccessToken()}` }
                    : {}),
            },
        })
    }
}
