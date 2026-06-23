import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { sessionStore, Session } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// 平台检测:直接判断,不用 useState/useEffect(AGENTS.md 跨端规范)
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

// 由 config/index.ts 通过 defineConstants 注入;生产构建为空字符串,测试入口自动隐藏
const TEST_LOGIN =
  TEST_LOGIN_EMAIL && TEST_LOGIN_PASSWORD
    ? { email: TEST_LOGIN_EMAIL, password: TEST_LOGIN_PASSWORD }
    : null

async function authCall(url: string, body: { email: string; password: string }): Promise<Session> {
  const res = await Network.request<{ data: Session }>({
    url,
    method: 'POST',
    data: body,
  })
  return res.data.data
}

function applySession(session: Session, successTitle: string) {
  sessionStore.set(session)
  Taro.showToast({ title: successTitle, icon: 'success' })
  setTimeout(() => Taro.reLaunch({ url: '/pages/index/index' }), 600)
}

export default function LoginPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loginWithCredentials = async (
    credentials: { email: string; password: string },
    options: { mode: 'sign-in' | 'sign-up'; successTitle?: string },
  ) => {
    if (!credentials.email || !credentials.password) {
      setError('请填写邮箱和密码')
      return
    }
    if (credentials.password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data =
        options.mode === 'sign-up'
          ? await authCall('/api/auth/sign-up', credentials)
          : await authCall('/api/auth/sign-in', credentials)
      applySession(data, options.successTitle ?? (options.mode === 'sign-up' ? '注册成功' : '登录成功'))
    } catch (e: any) {
      const msg =
        e?.data?.message ||
        e?.data?.error?.message ||
        e?.errMsg ||
        (options.mode === 'sign-up' ? '注册失败' : '登录失败')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    await loginWithCredentials({ email, password }, { mode })
  }

  const loginAsTestUser = async () => {
    if (!TEST_LOGIN) return
    setMode('sign-in')
    setEmail(TEST_LOGIN.email)
    setPassword(TEST_LOGIN.password)
    await loginWithCredentials(TEST_LOGIN, { mode: 'sign-in', successTitle: '测试账号登录成功' })
  }

  const loginWithWechat = async () => {
    setLoading(true)
    setError(null)
    try {
      const { code } = await Taro.login()
      if (!code) throw new Error('未获取到微信登录凭证')
      const res = await Network.request<{ data: Session }>({
        url: '/api/auth/wechat-login',
        method: 'POST',
        data: { code },
      })
      applySession(res.data.data, '登录成功')
    } catch (e: any) {
      const msg = e?.data?.message || e?.errMsg || '微信登录失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View
      className="w-full min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background:
          'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(109, 77, 255, 0.12), transparent 60%), #EEF0F6',
      }}
    >
      <View className="w-full max-w-md">
        <View className="mb-8 text-center">
          <Text className="block text-3xl font-bold text-on-surface">投研笔记</Text>
          <Text className="block text-sm text-on-surface-variant mt-2">
            {mode === 'sign-in' ? '登录以查看你的自选股与笔记' : '创建账户开始记录你的投研'}
          </Text>
        </View>

        {/* 邮箱密码登录区(主入口) */}
        <View
          className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85"
          style={{ boxShadow: '0 1px 2px rgba(20,18,60,0.04), 0 6px 24px rgba(20,18,60,0.06)' }}
        >
          <View className="space-y-4">
            <View>
              <Text className="block text-xs font-medium text-on-surface-variant mb-2">邮箱</Text>
              <Input
                type="text"
                value={email}
                onInput={(e: any) => setEmail(e.detail.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
            </View>
            <View>
              <Text className="block text-xs font-medium text-on-surface-variant mb-2">密码</Text>
              <Input
                type="text"
                password
                value={password}
                onInput={(e: any) => setPassword(e.detail.value)}
                placeholder="至少 6 位"
                disabled={loading}
                confirmType="done"
              />
            </View>

            {error ? (
              <View className="rounded-lg p-3 bg-error bg-opacity-10">
                <Text className="block text-xs text-error">{error}</Text>
              </View>
            ) : null}

            <Button
              onClick={submit}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              {mode === 'sign-in' ? '登录' : '注册'}
            </Button>

            {TEST_LOGIN ? (
              <Button
                onClick={loginAsTestUser}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-white text-primary text-sm font-semibold border border-primary border-opacity-30"
              >
                临时测试登录
              </Button>
            ) : null}
          </View>
        </View>

        {/* 切换登录/注册 */}
        <View className="mt-4 text-center">
          <Text
            className="text-xs text-primary"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
              setError(null)
            }}
          >
            {mode === 'sign-in' ? '没有账号?立即注册' : '已有账号?返回登录'}
          </Text>
        </View>

        {/* 微信登录(WEAPP 端,邮箱下方) */}
        {isWeapp ? (
          <>
            <View className="flex items-center gap-3 py-6">
              <View className="flex-1 h-px bg-on-surface-variant opacity-20" />
              <Text className="text-xs text-on-surface-variant">或使用微信</Text>
              <View className="flex-1 h-px bg-on-surface-variant opacity-20" />
            </View>
            <Button
              onClick={loginWithWechat}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#07C160] text-white text-sm font-semibold"
            >
              微信一键登录
            </Button>
          </>
        ) : null}
      </View>
    </View>
  )
}
