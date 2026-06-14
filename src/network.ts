import Taro from '@tarojs/taro'
import { createAuthenticatedRequester } from './auth/authenticated-request'
import { Session, sessionStore } from './auth/session'

export namespace Network {
  const PUBLIC_PATHS = ['/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/refresh']

  const createUrl = (url: string): string => {
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return `${PROJECT_DOMAIN}${url}`
  }

  const isPublicUrl = (url: string) => PUBLIC_PATHS.some((path) => url.includes(path))

  const redirectToLogin = () => {
    sessionStore.clear()
    try {
      Taro.hideToast?.()
      Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
    } catch {}
    setTimeout(() => {
      try {
        Taro.reLaunch({ url: '/pages/login/index' })
      } catch {}
    }, 800)
  }

  const refreshSession = async (refreshToken: string): Promise<Session> => {
    const response = await Taro.request<{ data?: Session; message?: string }>({
      url: createUrl('/api/auth/refresh'),
      method: 'POST',
      data: { refresh_token: refreshToken },
    })
    const session = response.data?.data
    if (response.statusCode !== 200 || !session?.access_token || !session?.refresh_token) {
      throw new Error(response.data?.message || '刷新登录状态失败')
    }
    return session
  }

  const authenticatedRequest = createAuthenticatedRequester<
    Taro.request.Option,
    Taro.request.SuccessCallbackResult<any>
  >({
    send: async (option, accessToken) => Taro.request({
      ...option,
      url: createUrl(option.url),
      header: {
        ...(option.header || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }),
    refresh: refreshSession,
    getSession: sessionStore.get,
    setSession: sessionStore.set,
    onUnauthorized: redirectToLogin,
    isPublic: (option) => isPublicUrl(option.url),
  })

  export const request = ((option: Taro.request.Option) => (
    authenticatedRequest(option)
  )) as typeof Taro.request

  export const uploadFile: typeof Taro.uploadFile = option => Taro.uploadFile({
    ...option,
    url: createUrl(option.url),
    header: {
      ...(option.header || {}),
      ...(sessionStore.getAccessToken()
        ? { Authorization: `Bearer ${sessionStore.getAccessToken()}` }
        : {}),
    },
  })

  export const downloadFile: typeof Taro.downloadFile = option => Taro.downloadFile({
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
