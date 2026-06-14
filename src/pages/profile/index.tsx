import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { sessionStore } from '@/auth/session'
import { Settings, Bell, CircleAlert, ChevronRight, CirclePlus, House, Sparkles, BookOpen, LogOut } from 'lucide-react-taro'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
}

interface Summary {
  stocks: number
  notes: number
  bull: number
}

export default function ProfilePage() {
  const [summary, setSummary] = useState<Summary>({ stocks: 0, notes: 0, bull: 0 })
  const [stocks, setStocks] = useState<Stock[]>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')

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

  useLoad(() => {
    if (!sessionStore.getAccessToken()) {
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setEmail(sessionStore.get()?.user?.email ?? '')
    load()
  })

  // 每次页面显示都重新拉取(包括从 stock-add 等子页面返回时)— 2026-06-14
  useDidShow(() => {
    if (sessionStore.getAccessToken()) {
      load()
    }
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

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
              <View className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
              >
                <Text className="block text-2xl font-bold text-white">初</Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="block text-lg font-bold text-on-surface">小初</Text>
                <Text className="block text-xs text-on-surface-variant mt-1">个人投资者 · 投研笔记</Text>
              </View>
            </View>
            {/* 数据小卡 */}
            <View className="mt-4 grid grid-cols-3 gap-3">
              <View className="flex flex-col items-center">
                <Text className="block text-xl font-bold text-on-surface tabular-nums">{summary.stocks}</Text>
                <Text className="block text-[11px] text-on-surface-variant mt-1">自选股</Text>
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
              { icon: <CirclePlus size={18} color="#5B5E72" />, label: '添加股票', url: '/pages/stock-add/index' },
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

        {/* 自选股管理 */}
        <View className="px-4 mt-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="block text-base font-semibold text-on-surface">管理自选股</Text>
            <View
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-primary"
              onClick={() => Taro.navigateTo({ url: '/pages/stock-add/index' })}
            >
              <CirclePlus size={14} color="#ffffff" />
              <Text className="block text-xs font-semibold text-white">添加</Text>
            </View>
          </View>
          {stocks.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">还没有添加自选股</Text>
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
                    <Text className="block text-sm font-semibold text-on-surface truncate">{s.name}</Text>
                    <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">{s.code}{s.industry ? ` · ${s.industry}` : ''}</Text>
                  </View>
                  <View
                    className="px-3 py-1 rounded-md bg-error bg-opacity-10"
                    onClick={() => handleRemove(s)}
                  >
                    <Text className="block text-xs font-semibold text-error">
                      {removing === s.id ? '删除中' : '删除'}
                    </Text>
                  </View>
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
              <View className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
              >
                <Text className="block text-white font-bold text-sm">{email.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="block text-sm text-on-surface truncate">{email}</Text>
                <Text className="block text-[11px] text-on-surface-variant">已登录</Text>
              </View>
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
    </ScrollView>
  )
}
