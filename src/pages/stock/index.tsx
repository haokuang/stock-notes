import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { ArrowLeft, EllipsisVertical, TrendingUp, Target, Shield, CirclePlus, Clock } from 'lucide-react-taro'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
  current_price: number | null
  change_percent: number | null
}

interface Note {
  id: string
  title: string
  content: string
  direction: 'bull' | 'bear' | 'neutral'
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

  const load = async (sid: string) => {
    if (!sid) return
    try {
      const [sRes, nRes, sumRes, distRes] = await Promise.all([
        Network.request<{ data: Stock }>({ url: `/api/stocks/${sid}` }),
        Network.request<{ data: Note[] }>({ url: `/api/notes?stock_id=${sid}&limit=100` }),
        Network.request<{ data: Summary }>({ url: `/api/notes/summary/${sid}` }),
        Network.request<any>({ url: `/api/notes/distribution/${sid}` }),
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

  const goAdd = () => Taro.navigateTo({ url: `/pages/note-edit/index?stock_id=${stockId}` })
  const goNote = (id: string) => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${id}` })

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

        {/* 观点列表 */}
        <View className="px-4 mt-4">
          <View className="flex items-center justify-between mb-3">
            <Text className="block text-base font-semibold text-on-surface">观点记录 · {notes.length}</Text>
            <View
              className="flex items-center gap-1 px-3 py-2 rounded-full bg-primary"
              onClick={goAdd}
            >
              <CirclePlus size={14} color="#ffffff" />
              <Text className="block text-xs font-semibold text-white">新增</Text>
            </View>
          </View>
          {notes.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">还没有观点，点击「新增」开始记录</Text>
            </View>
          ) : (
            <View className="space-y-3">
              {notes.map((n) => (
                <View
                  key={n.id}
                  className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.99] transition-transform"
                  onClick={() => goNote(n.id)}
                >
                  <View className="flex items-center gap-2 mb-2">
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
                    <Text className="block text-sm font-semibold text-on-surface flex-1 truncate">{n.title}</Text>
                  </View>
                  <Text className="block text-xs text-on-surface-variant leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {n.content}
                  </Text>
                  <View className="flex items-center gap-3 mt-2 text-[11px] text-on-surface-variant">
                    <View className="flex items-center gap-1">
                      <Clock size={12} color="#5B5E72" />
                      <Text className="block">{n.created_at?.slice(0, 10)}</Text>
                    </View>
                    {(n.entry_price || n.target_price || n.stop_loss) && (
                      <Text className="block tabular-nums">
                        {n.entry_price ? `入 ${n.entry_price}` : ''}{n.target_price ? ` 目标 ${n.target_price}` : ''}{n.stop_loss ? ` 止损 ${n.stop_loss}` : ''}
                      </Text>
                    )}
                    {n.tags && n.tags.length > 0 && (
                      <View className="flex items-center gap-1 flex-1 min-w-0">
                        {n.tags.slice(0, 2).map((t) => (
                          <Text key={t} className="px-2 py-1 rounded-md bg-surface-container text-[10px]">{t}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
