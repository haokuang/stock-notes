import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { sessionStore } from '@/auth/session'
import { Settings, Bell, CircleAlert, ChevronRight, CirclePlus, House, Sparkles, BookOpen, LogOut, UserCog } from 'lucide-react-taro'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import WechatProfileEditor from '@/components/wechat-profile-editor'
import { isMarketSubject, subjectSecondaryText, type SubjectType } from '@/stocks/subject'

interface Stock {
  id: string
  code: string
  name: string
  subject_type: SubjectType
  industry: string | null
}

interface Summary {
  stocks: number
  notes: number
  bull: number
}

interface WechatProfile {
  nickname: string | null
  avatar_url: string | null
  bound?: boolean
}

// 平台检测:直接判断(AGENTS.md 跨端规范)
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

export default function ProfilePage() {
  const [summary, setSummary] = useState<Summary>({ stocks: 0, notes: 0, bull: 0 })
  const [stocks, setStocks] = useState<Stock[]>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')
  const [wechat, setWechat] = useState<WechatProfile>({ nickname: null, avatar_url: null })
  // 完善资料弹窗
  const [editOpen, setEditOpen] = useState(false)
  // 绑定微信中
  const [binding, setBinding] = useState(false)

  const load = async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        Network.request<{ data: Summary }>({ url: '/api/stocks/summary' }),
        Network.request<{ data: Stock[] }>({ url: '/api/stocks' }),
      ])
      console.log('[profile] summary', sRes.data)
      console.log('[profile] stocks', stRes.data)
      setSummary(sRes.data?.data ?? { stocks: 0, notes: 0, bull: 0 })
      setStocks(stRes.data?.data ?? [])
    } catch (e) {
      console.error('[profile] load failed', e)
    }
  }

  const loadWechatProfile = async () => {
    try {
      const res = await Network.request<{ data: WechatProfile }>({ url: '/api/auth/wechat-profile' })
      setWechat(res.data?.data ?? { nickname: null, avatar_url: null })
    } catch (e) {
      // 非微信用户或未绑定,静默
    }
  }

  useLoad(() => {
    if (!sessionStore.getAccessToken()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setEmail(sessionStore.get()?.user?.email ?? '')
    load()
    loadWechatProfile()
  })

  // 每次页面显示都重新拉取(包括从 stock-add 等子页面返回时)— 2026-06-14
  useDidShow(() => {
    if (sessionStore.getAccessToken()) {
      load()
      loadWechatProfile()
    }
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  // 展示名:微信昵称 > 邮箱 > 默认
  const displayName = wechat.nickname || email || '未设置'
  // 头像首字 fallback
  const avatarFallback = (wechat.nickname || email || 'U').slice(0, 1).toUpperCase()
  // 邮箱登录用户(非微信虚拟邮箱)
  const isEmailUser = !!email && !email.endsWith('@wechat.local')
  // 已绑定微信
  const wechatBound = wechat.bound === true

  const bindWechat = async () => {
    setBinding(true)
    try {
      const { code } = await Taro.login()
      if (!code) throw new Error('未获取到微信登录凭证')
      await Network.request({
        url: '/api/auth/wechat-bind',
        method: 'POST',
        data: { code },
      })
      await loadWechatProfile()
      Taro.showToast({ title: '绑定成功', icon: 'success' })
    } catch (e: any) {
      const msg = e?.data?.message || e?.errMsg || '绑定失败'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setBinding(false)
    }
  }

  const handleRemove = async (stock: Stock) => {
    const res = await Taro.showModal({
      title: '确认删除',
      content: `确定要从自选中移除「${stock.name}」吗？相关观点会一并删除。`,
      confirmText: '删除',
      confirmColor: '#D11A4A',
    })
    if (!res.confirm) return
    setRemoving(stock.id)
    try {
      await Network.request({ url: `/api/stocks/${stock.id}`, method: 'DELETE' })
      Taro.showToast({ title: '已删除', icon: 'success' })
      await load()
    } catch (e) {
      console.error('[profile] remove failed', e)
      Taro.showToast({ title: '删除失败', icon: 'none' })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <ScrollView
      scrollY
      enhanced
      showScrollbar={false}
      className="w-full min-h-full"
      style={{ background: '#EEF0F6' }}
    >
      <View className="w-full pb-8">
        {/* 用户信息 */}
        <View className="px-4 pt-5 pb-3">
          <View className="rounded-2xl p-5 bg-white bg-opacity-72 border border-white border-opacity-85"
            style={{ boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.06)' }}
          >
            <View className="flex items-center gap-3">
              {wechat.avatar_url ? (
                <Image src={wechat.avatar_url} className="w-16 h-16 rounded-full shrink-0" />
              ) : (
                <View className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
                >
                  <Text className="block text-2xl font-bold text-white">{avatarFallback}</Text>
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="block text-lg font-bold text-on-surface truncate">{displayName}</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">个人投资者 · 投研笔记</Text>
              </View>
              {isWeapp ? (
                <View
                  className="px-3 py-2 rounded-lg flex items-center gap-1 border border-primary border-opacity-30"
                  style={{ backgroundColor: 'rgba(109, 77, 255, 0.08)' }}
                  onClick={() => setEditOpen(true)}
                >
                  <UserCog size={14} color="#6D4DFF" />
                  <Text className="text-sm font-semibold text-primary">完善资料</Text>
                </View>
              ) : null}
            </View>
            {/* 数据小卡 */}
            <View className="mt-4 grid grid-cols-3 gap-3">
              <View className="flex flex-col items-center">
                <Text className="block text-xl font-bold text-on-surface tabular-nums">{summary.stocks}</Text>
                <Text className="block text-[11px] text-on-surface-variant mt-1">自选标的</Text>
              </View>
              <View className="flex flex-col items-center border-x border-outline-variant border-opacity-30">
                <Text className="block text-xl font-bold text-on-surface tabular-nums">{summary.notes}</Text>
                <Text className="block text-[11px] text-on-surface-variant mt-1">观点</Text>
              </View>
              <View className="flex flex-col items-center">
                <Text className="block text-xl font-bold text-on-surface tabular-nums">{summary.bull}</Text>
                <Text className="block text-[11px] text-on-surface-variant mt-1">看多</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 快捷入口 */}
        <View className="px-4 mt-2">
          <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
            {[
              { icon: <House size={18} color="#5B5E72" />, label: '首页', url: '/pages/index/index', tab: true },
              { icon: <BookOpen size={18} color="#5B5E72" />, label: '观点库', url: '/pages/library/index', tab: true },
              { icon: <Sparkles size={18} color="#5B5E72" />, label: 'AI 分析', url: '/pages/analysis/index', tab: true },
              { icon: <CirclePlus size={18} color="#5B5E72" />, label: '添加标的', url: '/pages/stock-add/index' },
            ].map((item, i) => (
              <View
                key={item.label}
                className="flex items-center gap-3 px-4 py-4 active:bg-surface-container"
                style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                onClick={() => item.tab ? Taro.switchTab({ url: item.url }) : Taro.navigateTo({ url: item.url })}
              >
                {item.icon}
                <Text className="flex-1 block text-sm text-on-surface">{item.label}</Text>
                <ChevronRight size={16} color="#C0C2CF" />
              </View>
            ))}
          </View>
        </View>

        {/* 自选管理 */}
        <View className="px-4 mt-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="block text-base font-semibold text-on-surface">管理自选</Text>
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => Taro.navigateTo({ url: '/pages/stock-add/index' })}
            >
              <CirclePlus size={14} color="#ffffff" />
              <Text className="block text-xs font-semibold text-white">添加</Text>
            </Button>
          </View>
          {stocks.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">还没有添加研究标的</Text>
            </View>
          ) : (
            <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
              {stocks.map((s, i) => (
                <View
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-4"
                  style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                >
                  <View className="flex-1 min-w-0" onClick={() => Taro.navigateTo({ url: `/pages/stock/index?stock_id=${s.id}` })}>
                    <View className="flex items-center gap-2">
                      <Text className="block text-sm font-semibold text-on-surface truncate">{s.name}</Text>
                      {isMarketSubject(s) ? (
                        <Badge variant="secondary">
                          <Text className="block text-xs font-semibold">市场研究</Text>
                        </Badge>
                      ) : null}
                    </View>
                    <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">{subjectSecondaryText(s)}</Text>
                  </View>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={removing === s.id}
                    onClick={() => handleRemove(s)}
                  >
                    <Text className="block text-xs font-semibold text-white">
                      {removing === s.id ? '删除中' : '删除'}
                    </Text>
                  </Button>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 设置 */}
        <View className="px-4 mt-4">
          <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
            {[
              { icon: <Bell size={18} color="#5B5E72" />, label: '通知设置' },
              { icon: <Settings size={18} color="#5B5E72" />, label: '偏好设置' },
              { icon: <CircleAlert size={18} color="#5B5E72" />, label: '帮助与反馈' },
            ].map((item, i) => (
              <View
                key={item.label}
                className="flex items-center gap-3 px-4 py-4 active:bg-surface-container"
                style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
              >
                {item.icon}
                <Text className="flex-1 block text-sm text-on-surface">{item.label}</Text>
                <ChevronRight size={16} color="#C0C2CF" />
              </View>
            ))}
          </View>
        </View>

        {email ? (
          <View className="px-4 mt-6">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-3">
              {wechat.avatar_url ? (
                <Image src={wechat.avatar_url} className="w-9 h-9 rounded-full shrink-0" />
              ) : (
                <View className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
                >
                  <Text className="block text-white font-bold text-sm">{email.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="block text-sm text-on-surface truncate">{email}</Text>
                <Text className="block text-[11px] text-on-surface-variant">
                  {wechatBound ? '已绑定微信 · 已登录' : '已登录'}
                </Text>
              </View>
              {/* 邮箱用户未绑定微信时显示绑定按钮 */}
              {isWeapp && isEmailUser && !wechatBound ? (
                <View
                  className="px-3 py-2 rounded-lg flex items-center gap-1 border border-primary border-opacity-30"
                  style={{ backgroundColor: 'rgba(109, 77, 255, 0.08)' }}
                  onClick={bindWechat}
                >
                  <Text className="text-sm font-semibold text-primary">{binding ? '绑定中…' : '绑定微信'}</Text>
                </View>
              ) : null}
              <View
                className="px-3 py-2 rounded-lg flex items-center gap-1 border"
                style={{ backgroundColor: 'rgba(209, 26, 74, 0.10)', borderColor: 'rgba(209, 26, 74, 0.30)' }}
                onClick={async () => {
                  const ok = await Taro.showModal({ title: '确认登出', content: '登出后需要重新登录' })
                  if (ok.confirm) {
                    sessionStore.clear()
                    Taro.reLaunch({ url: '/pages/login/index' })
                  }
                }}
              >
                <LogOut size={14} color="#D11A4A" />
                <Text className="text-sm font-semibold text-error">登出</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* 完善资料弹窗:微信头像昵称填写能力 */}
      {isWeapp ? (
        <WechatProfileEditor
          open={editOpen}
          onOpenChange={setEditOpen}
          current={wechat}
          fallbackInitial={avatarFallback}
          onSaved={setWechat}
        />
      ) : null}
    </ScrollView>
  )
}
