import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Network } from '@/network'
import { sessionStore, Session } from '@/auth/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

async function authCall(url: string, body: { email: string; password: string }): Promise<Session> {
  const res = await Network.request<{ data: Session }>({
    url,
    method: 'POST',
    data: body,
  })
  return res.data.data
}

export default function LoginPage() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!email || !password) {
      setError('请填写邮箱和密码')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data =
        mode === 'sign-up'
          ? await authCall('/api/auth/sign-up', { email, password })
          : await authCall('/api/auth/sign-in', { email, password })
      sessionStore.set(data)
      Taro.showToast({ title: mode === 'sign-up' ? '注册成功' : '登录成功', icon: 'success' })
      setTimeout(() => Taro.reLaunch({ url: '/pages/index/index' }), 600)
    } catch (e: any) {
      const msg =
        e?.data?.message ||
        e?.data?.error?.message ||
        e?.errMsg ||
        (mode === 'sign-up' ? '注册失败' : '登录失败')
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
                type="safe-password"
                value={password}
                onInput={(e: any) => setPassword(e.detail.value)}
                placeholder="至少 6 位"
                disabled={loading}
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
          </View>
        </View>

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

        <View className="mt-8 px-4 text-center">
          <Text className="block text-[13px] text-on-surface-variant leading-relaxed">
            注册时需使用真实邮箱域名(如 @gmail.com / @qq.com)
            {'\n'}若开启邮箱确认,首次登录请查收邮件
          </Text>
        </View>
      </View>
    </View>
  )
}
