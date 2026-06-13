import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { ArrowLeft, EllipsisVertical, TrendingUp, Target, Shield, CirclePlus, Clock, RefreshCw, Sparkles } from 'lucide-react-taro'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
  current_price: number | null
  change_percent: number | null
  open_price: number | null
  high_price: number | null
  low_price: number | null
  pre_close: number | null
  price_date: string | null
}

interface Note {
  id: string
  type: 'note' | 'doc'
  title: string
  content: string
  direction: 'bull' | 'bear' | 'neutral' | null
  entry_price: number | null
  target_price: number | null
  stop_loss: number | null
  tags: string[] | null
  related_event: string | null
  source: string | null
  images: string[] | null
  created_at: string
}

interface Summary {
  total: number
  avg_entry_price: number | null
  avg_target_price: number | null
  avg_stop_loss: number | null
}

interface Distribution {
  bull: number
  bear: number
  neutral: number
}

export default function StockDetailPage() {
  const [stock, setStock] = useState<Stock | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, avg_entry_price: null, avg_target_price: null, avg_stop_loss: null })
  const [distribution, setDistribution] = useState<Distribution>({ bull: 0, bear: 0, neutral: 0 })
  const [stockId, setStockId] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [briefing, setBriefing] = useState(false)

  const load = async (sid: string) => {
    if (!sid) return
    try {
      const [sRes, nRes, sumRes, distRes] = await Promise.all([
        Network.request<{ data: Stock }>({ url: `/api/stocks/${sid}` }),
        Network.request<{ data: Note[] }>({ url: `/api/notes?stock_id=${sid}&limit=100` }),
        Network.request<{ data: Summary }>({ url: `/api/notes/summary/${sid}` }),
        Network.request<{ data: Distribution }>({ url: `/api/notes/distribution/${sid}` }),
      ])
      console.log('[stock] s', sRes.data, 'n', nRes.data, 'sum', sumRes.data, 'dist', distRes.data)
      setStock(sRes.data?.data ?? null)
      setNotes(nRes.data?.data ?? [])
      setSummary(sumRes.data?.data ?? { total: 0, avg_entry_price: null, avg_target_price: null, avg_stop_loss: null })
      setDistribution(distRes.data?.data ?? { bull: 0, bear: 0, neutral: 0 })
    } catch (e) {
      console.error('[stock] load failed', e)
    }
  }

  useLoad((opts) => {
    const sid = opts?.stock_id ?? ''
    setStockId(sid)
    Taro.setNavigationBarTitle({ title: '股票详情' })
    load(sid)
  })

  usePullDownRefresh(async () => {
    await load(stockId)
    Taro.stopPullDownRefresh()
  })

  const goAdd = (asDoc: 'note' | 'doc' = 'note') => Taro.navigateTo({ url: `/pages/note-edit/index?stock_id=${stockId}&type=${asDoc}` })
  const goNote = (id: string) => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${id}` })

  const onRefreshPrice = async () => {
    if (!stockId || refreshing) return
    setRefreshing(true)
    Taro.showLoading({ title: '同步行情中...' })
    try {
      const res = await Network.request<{ data: { updated: boolean; price_date: string; close: number; change_percent: number } }>({
        url: `/api/stocks/${stockId}/refresh-price`,
        method: 'POST',
      })
      console.log('[stock] refresh', res.data)
      const r = res.data?.data
      Taro.hideLoading()
      if (r?.updated) {
        Taro.showToast({ title: '已同步', icon: 'success' })
        await load(stockId)
      } else {
        Taro.showToast({ title: '今日已是最新', icon: 'none' })
      }
    } catch (e: any) {
      Taro.hideLoading()
      console.error('[stock] refresh failed', e)
      Taro.showToast({ title: '同步失败', icon: 'none' })
    } finally {
      setRefreshing(false)
    }
  }

  const onAiBrief = async () => {
    if (!stockId || briefing) return
    setBriefing(true)
    Taro.showLoading({ title: 'AI 分析中...' })
    try {
      const res = await Network.request<{ data: any }>({
        url: `/api/ai/daily-brief/${stockId}`,
        method: 'POST',
      })
      Taro.hideLoading()
      const brief = res.data?.data
      if (brief) {
        Taro.navigateTo({
          url: `/pages/ai-report/index?stock_id=${stockId}&brief=${encodeURIComponent(JSON.stringify(brief))}`,
        })
      } else {
        Taro.showToast({ title: '生成失败', icon: 'none' })
      }
    } catch (e: any) {
      Taro.hideLoading()
      console.error('[stock] ai brief failed', e)
      Taro.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      setBriefing(false)
    }
  }

  const initial = stock?.name?.slice(0, 1) ?? '?'
  const isUp = (stock?.change_percent ?? 0) >= 0

  return (
    <View className="w-full min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* 自定义 Header */}
      <View className="flex items-center justify-between px-4 pt-3 pb-2 bg-background sticky top-0 z-40" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#161826" />
        </View>
        <Text className="block text-base font-semibold text-on-surface">{stock?.name ?? '加载中...'}</Text>
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container">
          <EllipsisVertical size={20} color="#5B5E72" />
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* Hero 区 */}
        {stock && (
          <View className="px-4 pt-3">
            <View
              className="rounded-2xl border p-4 relative overflow-hidden"
              style={{
                background: 'rgba(255, 255, 255, 0.88)',
                borderColor: 'rgba(109, 77, 255, 0.25)',
                boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.06)',
              }}
            >
              <View
                className="absolute -top-12 left-1/2 w-80 h-32 pointer-events-none"
                style={{ transform: 'translateX(-50%)', background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(109, 77, 255, 0.22), transparent 70%)' }}
              />
              <View className="relative flex items-start gap-3">
                <View className="w-16 h-16 rounded-2xl bg-white bg-opacity-80 border flex items-center justify-center shrink-0"
                  style={{ borderColor: 'rgba(109, 77, 255, 0.30)' }}
                >
                  <Text className="block text-2xl font-bold text-primary">{initial}</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="block text-2xl font-bold text-on-surface leading-tight">{stock.name}</Text>
                  <View className="flex items-center gap-2 mt-2 flex-wrap">
                    <Text className="block text-xs text-on-surface-variant tabular-nums">{stock.code}</Text>
                    {stock.industry && (
                      <View className="px-2 py-1 rounded-full" style={{ background: '#ECE7FF' }}>
                        <Text className="block text-[11px] font-semibold text-primary">{stock.industry}</Text>
                      </View>
                    )}
                    {stock.price_date && (
                      <Text className="block text-[10px] text-on-surface-variant">{stock.price_date}</Text>
                    )}
                  </View>
                </View>
              </View>
              <View className="relative mt-4 flex items-end gap-2 flex-wrap">
                <Text className="block text-3xl font-bold text-on-surface tabular-nums leading-none">
                  {stock.current_price != null ? stock.current_price.toFixed(2) : '—'}
                </Text>
                <View
                  className="px-2 py-1 rounded-full"
                  style={{ background: isUp ? 'rgba(15, 140, 102, 0.10)' : 'rgba(209, 26, 74, 0.10)' }}
                >
                  <Text className="block text-xs font-bold tabular-nums" style={{ color: isUp ? '#0F8C66' : '#D11A4A' }}>
                    {stock.change_percent != null ? `${isUp ? '+' : ''}${stock.change_percent.toFixed(2)}%` : '—'}
                  </Text>
                </View>
              </View>
              {/* 今日行情 OHLCV */}
              {stock.open_price != null && (
                <View className="relative mt-4 pt-3 border-t border-outline-variant border-opacity-30 grid grid-cols-4 gap-2">
                  <View>
                    <Text className="block text-[10px] text-on-surface-variant">开盘</Text>
                    <Text className="block text-xs font-semibold text-on-surface tabular-nums">{stock.open_price.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-[10px] text-on-surface-variant">最高</Text>
                    <Text className="block text-xs font-semibold tabular-nums" style={{ color: '#D11A4A' }}>{stock.high_price?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-[10px] text-on-surface-variant">最低</Text>
                    <Text className="block text-xs font-semibold tabular-nums" style={{ color: '#0F8C66' }}>{stock.low_price?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-[10px] text-on-surface-variant">昨收</Text>
                    <Text className="block text-xs font-semibold text-on-surface tabular-nums">{stock.pre_close?.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 操作按钮行：刷新 / AI 简评 / 新增观点 / 新增文档 */}
        {stock && (
          <View className="px-4 mt-4">
            <View className="grid grid-cols-2 gap-2">
              <View
                className="rounded-2xl p-3 flex items-center justify-center gap-2 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.98] transition-transform"
                onClick={onRefreshPrice}
              >
                <RefreshCw size={16} color={refreshing ? '#9498AC' : '#6D4DFF'} />
                <Text className="block text-sm font-semibold text-on-surface">{refreshing ? '同步中' : '刷新行情'}</Text>
              </View>
              <View
                className="rounded-2xl p-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ background: briefing ? 'rgba(109, 77, 255, 0.30)' : '#6D4DFF' }}
                onClick={onAiBrief}
              >
                <Sparkles size={16} color="#ffffff" />
                <Text className="block text-sm font-semibold text-white">{briefing ? 'AI 分析中' : 'AI 今日简评'}</Text>
              </View>
            </View>
            <View className="grid grid-cols-2 gap-2 mt-2">
              <View
                className="rounded-xl py-3 flex items-center justify-center gap-1 bg-white bg-opacity-72 border border-white border-opacity-85"
                onClick={() => goAdd('note')}
              >
                <CirclePlus size={14} color="#6D4DFF" />
                <Text className="block text-xs font-semibold text-on-surface">新增观点</Text>
              </View>
              <View
                className="rounded-xl py-3 flex items-center justify-center gap-1 bg-white bg-opacity-72 border border-white border-opacity-85"
                onClick={() => goAdd('doc')}
              >
                <Text className="block text-xs font-semibold text-on-surface">上传文档</Text>
              </View>
            </View>
          </View>
        )}

        {/* 价格快照 */}
        {stock && (
          <View className="px-4 mt-4">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="grid grid-cols-3 gap-3">
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <TrendingUp size={16} color="#6D4DFF" />
                    <Text className="block text-[12px] text-on-surface-variant">入场均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_entry_price != null ? summary.avg_entry_price.toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-[11px] text-on-surface-variant mt-2">{summary.total} 条</Text>
                </View>
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <Target size={16} color="#0F8C66" />
                    <Text className="block text-[12px] text-on-surface-variant">目标均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_target_price != null ? summary.avg_target_price.toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-[11px] text-on-surface-variant mt-2">{summary.total} 条</Text>
                </View>
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <Shield size={16} color="#D11A4A" />
                    <Text className="block text-[12px] text-on-surface-variant">止损均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_stop_loss != null ? summary.avg_stop_loss.toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-[11px] text-on-surface-variant mt-2">{summary.total} 条</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 观点分布 */}
        {summary.total > 0 && (
          <View className="px-4 mt-4">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm font-semibold text-on-surface mb-3">观点分布</Text>
              <View className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-surface-container">
                {summary.total > 0 && (
                  <>
                    <View className="h-full" style={{ background: '#0F8C66', flex: distribution.bull }} />
                    <View className="h-full" style={{ background: '#B45309', flex: distribution.neutral }} />
                    <View className="h-full" style={{ background: '#D11A4A', flex: distribution.bear }} />
                  </>
                )}
              </View>
              <View className="flex items-center justify-between mt-3 text-[11px] text-on-surface-variant">
                <View className="flex items-center gap-2">
                  <View className="w-2 h-2 rounded-full" style={{ background: '#0F8C66' }} />
                  <Text className="block">看多 {distribution.bull}</Text>
                </View>
                <View className="flex items-center gap-2">
                  <View className="w-2 h-2 rounded-full" style={{ background: '#B45309' }} />
                  <Text className="block">中性 {distribution.neutral}</Text>
                </View>
                <View className="flex items-center gap-2">
                  <View className="w-2 h-2 rounded-full" style={{ background: '#D11A4A' }} />
                  <Text className="block">看空 {distribution.bear}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 观点 + 文档列表 */}
        <View className="px-4 mt-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="block text-base font-semibold text-on-surface">记录 · {notes.length}</Text>
          </View>
          {notes.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">还没有记录，点击「新增观点」开始记录</Text>
            </View>
          ) : (
            <View className="space-y-3">
              {notes.map((n) => {
                const isDoc = n.type === 'doc'
                return (
                  <View
                    key={n.id}
                    className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.99] transition-transform"
                    onClick={() => goNote(n.id)}
                  >
                    <View className="flex items-center gap-2 mb-2">
                      {isDoc ? (
                        <View className="px-2 py-1 rounded-full" style={{ background: 'rgba(15, 140, 102, 0.10)' }}>
                          <Text className="block text-[10px] font-semibold" style={{ color: '#0F8C66' }}>文档</Text>
                        </View>
                      ) : (
                        <View
                          className="px-2 py-1 rounded-full"
                          style={{
                            background: n.direction === 'bull' ? 'rgba(15, 140, 102, 0.10)' : n.direction === 'bear' ? 'rgba(209, 26, 74, 0.10)' : 'rgba(180, 83, 9, 0.10)',
                          }}
                        >
                          <Text
                            className="block text-[11px] font-semibold"
                            style={{ color: n.direction === 'bull' ? '#0F8C66' : n.direction === 'bear' ? '#D11A4A' : '#B45309' }}
                          >
                            {n.direction === 'bull' ? '看多' : n.direction === 'bear' ? '看空' : '中性'}
                          </Text>
                        </View>
                      )}
                      <Text className="block text-sm font-semibold text-on-surface flex-1 truncate">{n.title}</Text>
                    </View>
                    {!isDoc && n.content ? (
                      <Text className="block text-xs text-on-surface-variant leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {n.content}
                      </Text>
                    ) : null}
                    <View className="flex items-center gap-3 mt-2 text-[11px] text-on-surface-variant">
                      <View className="flex items-center gap-1">
                        <Clock size={12} color="#5B5E72" />
                        <Text className="block">{n.created_at?.slice(0, 10)}</Text>
                      </View>
                      {!isDoc && (n.entry_price || n.target_price || n.stop_loss) && (
                        <Text className="block tabular-nums">
                          {n.entry_price ? `入 ${n.entry_price}` : ''}{n.target_price ? ` 目标 ${n.target_price}` : ''}{n.stop_loss ? ` 止损 ${n.stop_loss}` : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
