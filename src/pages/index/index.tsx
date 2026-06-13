import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Search, Bell, Plus, CirclePlus, PenLine, ImagePlus, Sparkles, ChevronRight, Clock } from 'lucide-react-taro'

/* === 类型定义 === */
interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
  current_price: string | null
  change_amount: string | null
  change_percent: string | null
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface Note {
  id: string
  stock_id: string
  stock_code: string
  stock_name: string
  title: string
  content: string | null
  direction: 'bull' | 'bear' | 'neutral'
  entry_price: string | null
  target_price: string | null
  stop_loss: string | null
  tags: string[]
  event: string | null
  source: string | null
  images: string[]
  ai_summary: string | null
  created_at: string
  updated_at: string
}

interface HeatmapData {
  data: Record<string, number>
  total: number
  activeDays: number
  fromDays: number
}

interface Summary {
  stocks: number
  notes: number
  bull: number
}

/* === 热力图常量 === */
const WEEKS = 53
const DAYS = 7
const COL_W = 10
const ROW_H = 10
const GAP = 3
const COL_TOTAL = COL_W + GAP

const directionMeta = {
  bull: { label: '看多', bg: 'bg-success bg-opacity-15', text: 'text-success' },
  bear: { label: '看空', bg: 'bg-error bg-opacity-15', text: 'text-error' },
  neutral: { label: '中性', bg: 'bg-warning bg-opacity-15', text: 'text-warning' },
}

/* === 工具 === */
const toNum = (v: string | null | undefined) => (v == null ? 0 : Number(v))
const formatPrice = (v: string | null | undefined) => {
  const n = toNum(v)
  return n ? n.toFixed(2) : '--'
}
const formatPercent = (v: string | null | undefined) => {
  const n = toNum(v)
  if (!n) return '--'
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}
const timeAgo = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 2) return '昨天'
  return `${d} 天前`
}

/* === 热力图格子颜色（5 级） === */
const heatmapBg = (count: number): string => {
  if (count === 0) return 'bg-surface-container'
  if (count <= 2) return 'bg-[rgba(109,77,255,0.18)]'
  if (count <= 5) return 'bg-[rgba(109,77,255,0.40)]'
  if (count <= 10) return 'bg-[rgba(109,77,255,0.65)]'
  return 'bg-primary'
}

export default function IndexPage() {
  const [summary, setSummary] = useState<Summary>({ stocks: 0, notes: 0, bull: 0 })
  const [stocks, setStocks] = useState<Stock[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapData>({ data: {}, total: 0, activeDays: 0, fromDays: 365 })

  const loadAll = async () => {
    try {
      const [sumRes, stockRes, noteRes, hmRes] = await Promise.all([
        Network.request<{ data: Summary }>({ url: '/api/stocks/summary' }),
        Network.request<{ data: Stock[] }>({ url: '/api/stocks' }),
        Network.request<{ data: Note[] }>({ url: '/api/notes?limit=10' }),
        Network.request<HeatmapData>({ url: '/api/notes/heatmap?days=365' }),
      ])
      console.log('[home] summary', sumRes.data)
      console.log('[home] stocks', stockRes.data)
      console.log('[home] notes', noteRes.data)
      console.log('[home] heatmap', hmRes.data)
      setSummary(sumRes.data?.data ?? { stocks: 0, notes: 0, bull: 0 })
      setStocks(stockRes.data?.data ?? [])
      setNotes(noteRes.data?.data ?? [])
      setHeatmap(hmRes.data ?? { data: {}, total: 0, activeDays: 0, fromDays: 365 })
    } catch (e) {
      console.error('[home] load failed', e)
    }
  }

  useLoad(() => {
    loadAll()
  })

  usePullDownRefresh(async () => {
    await loadAll()
    Taro.stopPullDownRefresh()
  })

  /* === 热力图：构造 53×7 网格 === */
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - (WEEKS * 7 - 1))
  const startDow = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - startDow)

  const months: Array<{ w: number; label: string }> = []
  let lastMonth = -1
  for (let w = 0; w < WEEKS; w++) {
    const colDate = new Date(start)
    colDate.setDate(start.getDate() + w * 7)
    if (colDate.getMonth() !== lastMonth && colDate.getDate() <= 7 && w > 0) {
      months.push({ w, label: colDate.getMonth() + 1 + '月' })
      lastMonth = colDate.getMonth()
    }
  }

  const cells: Array<{ date: string; count: number; visible: boolean }> = []
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const cellDate = new Date(start)
      cellDate.setDate(start.getDate() + w * 7 + d)
      const visible = cellDate <= today
      const key = cellDate.toISOString().slice(0, 10)
      cells.push({
        date: key,
        count: visible ? heatmap.data[key] ?? 0 : 0,
        visible,
      })
    }
  }

  /* === 渲染 === */
  return (
    <View
      className="w-full min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]"
      style={{
        background:
          'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(109, 77, 255, 0.12), transparent 60%), #EEF0F6',
      }}
    >
      {/* === 1. Header === */}
      <View className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-background bg-opacity-80 backdrop-blur-md">
        <View className="flex items-center gap-3">
          <View className="relative w-9 h-9 rounded-xl flex items-center justify-center bg-white bg-opacity-72 border border-white border-opacity-85"
            style={{ boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.06)' }}
          >
            <Text className="block text-[15px] font-bold text-primary tracking-wide">投研</Text>
            <View className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary" />
          </View>
          <View className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
          >
            <Text className="block text-white font-bold text-sm">初</Text>
          </View>
        </View>
        <View className="flex items-center gap-1">
          <View
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container"
            onClick={() => Taro.navigateTo({ url: '/pages/stock-search/index' })}
          >
            <Search size={20} color="#5B5E72" />
          </View>
          <View className="relative w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container">
            <Bell size={20} color="#5B5E72" />
            <View className="absolute top-2 right-2 w-2 h-2 rounded-full bg-error" style={{ boxShadow: '0 0 0 2px #EEF0F6' }} />
          </View>
        </View>
      </View>

      {/* === 2. 问候区 === */}
      <View className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <View className="min-w-0">
          <Text className="block text-2xl font-bold text-on-surface leading-tight">晚上好，小初</Text>
          <Text className="block text-sm text-on-surface-variant mt-2">
            今天关注 {summary.stocks} 只股票 · 已记录 {summary.notes} 条观点
          </Text>
        </View>
        <View
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-95 transition-transform"
          onClick={() => Taro.navigateTo({ url: '/pages/note-edit/index' })}
        >
          <Plus size={24} color="#6D4DFF" />
        </View>
      </View>

      {/* === 3. 概览统计卡 === */}
      <View className="px-4 mt-2">
        <View
          className="rounded-2xl p-4 overflow-hidden bg-white bg-opacity-72 border border-white border-opacity-85"
          style={{
            boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.06)',
            backgroundImage: 'linear-gradient(135deg, rgba(109,77,255,0.04), rgba(15,140,102,0.04)), linear-gradient(white, white)',
          }}
        >
          <View className="grid grid-cols-3 gap-3">
            <View className="flex flex-col items-center">
              <Text className="block text-2xl font-bold tabular-nums"
                style={{ background: 'linear-gradient(90deg, #6D4DFF 0%, #0F8C66 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
              >
                {summary.stocks}
              </Text>
              <Text className="block text-[11px] text-on-surface-variant mt-1">关注股票</Text>
            </View>
            <View className="flex flex-col items-center border-x border-outline-variant border-opacity-30">
              <Text className="block text-2xl font-bold tabular-nums"
                style={{ background: 'linear-gradient(90deg, #6D4DFF 0%, #0F8C66 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
              >
                {summary.notes}
              </Text>
              <Text className="block text-[11px] text-on-surface-variant mt-1">观点总数</Text>
            </View>
            <View className="flex flex-col items-center">
              <Text className="block text-2xl font-bold tabular-nums"
                style={{ background: 'linear-gradient(90deg, #6D4DFF 0%, #0F8C66 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
              >
                {summary.bull}
              </Text>
              <Text className="block text-[11px] text-on-surface-variant mt-1">看多数</Text>
            </View>
          </View>
        </View>
      </View>

      {/* === 4. 快捷操作 4 宫格 === */}
      <View className="px-4 mt-5">
        <View className="grid grid-cols-4 gap-3">
          {[
            { icon: <CirclePlus size={24} color="#6D4DFF" />, label: '添加股票', url: '/pages/stock-add/index' },
            { icon: <PenLine size={24} color="#6D4DFF" />, label: '新建观点', url: '/pages/note-edit/index' },
            { icon: <ImagePlus size={24} color="#6D4DFF" />, label: '截图解读', url: '/pages/image-ai/index' },
            { icon: <Sparkles size={24} color="#6D4DFF" />, label: 'AI 报告', url: '/pages/analysis/index' },
          ].map((qa) => (
            <View
              key={qa.label}
              className="flex flex-col items-center gap-2 py-3 rounded-xl bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-95 transition-transform"
              onClick={() => Taro.navigateTo({ url: qa.url })}
            >
              {qa.icon}
              <Text className="block text-[11px] font-medium text-on-surface">{qa.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* === 5. 观点活跃度热力图 === */}
      <View className="px-4 mt-6">
        <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85"
          style={{ boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.06)' }}
        >
          {/* 标题行 */}
          <View className="flex items-start justify-between gap-3 mb-3">
            <View className="min-w-0">
              <Text className="block text-sm font-semibold text-on-surface">观点活跃度</Text>
              <Text className="block text-[11px] text-on-surface-variant mt-1">
                过去 {heatmap.fromDays} 天 · 共 {heatmap.total} 条观点 · 活跃 {heatmap.activeDays} 天
              </Text>
            </View>
            <View className="flex items-center gap-2 text-xs text-on-surface-variant shrink-0 pt-1">
              <Text className="block text-xs">少</Text>
              <View className="flex gap-1">
                <View className="w-3 h-3 rounded-[2px] bg-surface-container" />
                <View className="w-3 h-3 rounded-[2px] bg-[rgba(109,77,255,0.18)]" />
                <View className="w-3 h-3 rounded-[2px] bg-[rgba(109,77,255,0.40)]" />
                <View className="w-3 h-3 rounded-[2px] bg-[rgba(109,77,255,0.65)]" />
                <View className="w-3 h-3 rounded-[2px] bg-primary" />
              </View>
              <Text className="block text-xs">多</Text>
            </View>
          </View>

          {/* 热力图主体（横向滚动） */}
          <ScrollView scrollX enhanced showScrollbar={false} className="scrollbar-hide">
            <View className="inline-block">
              {/* 月份标签行 */}
              <View className="flex ml-[18px] mb-1" style={{ height: '12px' }}>
                {Array.from({ length: WEEKS }).map((_, w) => {
                  const m = months.find((x) => x.w === w)
                  return (
                    <View
                      key={w}
                      style={{ width: `${COL_TOTAL}px`, height: '10px' }}
                      className="shrink-0"
                    >
                      {m ? (
                        <Text className="block text-[9px] text-on-surface-variant text-opacity-70 leading-[10px]">{m.label}</Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>
              {/* 主网格：左星期 + 53 列方格 */}
              <View className="flex">
                <View className="flex flex-col shrink-0 text-[9px] text-on-surface-variant text-opacity-70" style={{ width: '15px', marginRight: '3px' }}>
                  {['一', '', '三', '', '五', '', '日'].map((t, i) => (
                    <Text key={i} className="block leading-[10px] text-[9px]" style={{ height: `${ROW_H}px`, marginBottom: `${GAP}px` }}>
                      {t}
                    </Text>
                  ))}
                </View>
                <View className="flex">
                  {Array.from({ length: WEEKS }).map((_, w) => (
                    <View key={w} className="flex flex-col shrink-0" style={{ marginRight: `${GAP}px` }}>
                      {Array.from({ length: DAYS }).map((_d, d) => {
                        const cell = cells[w * DAYS + d]
                        if (!cell.visible) {
                          return <View key={d} style={{ width: `${COL_W}px`, height: `${ROW_H}px`, marginBottom: `${GAP}px` }} className="rounded-[2px]" />
                        }
                        return (
                          <View
                            key={d}
                            className={`rounded-[2px] ${heatmapBg(cell.count)}`}
                            style={{ width: `${COL_W}px`, height: `${ROW_H}px`, marginBottom: `${GAP}px` }}
                            onClick={() => Taro.navigateTo({ url: `/pages/heatmap-detail/index?date=${cell.date}` })}
                          />
                        )
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      {/* === 6. 自选股横向滑动 === */}
      <View className="mt-6">
        <View className="flex items-center justify-between px-4 mb-3">
          <Text className="block text-base font-semibold text-on-surface">我的自选</Text>
          <View className="text-xs font-medium text-primary inline-flex items-center gap-1"
            onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}
          >
            <Text className="block text-xs font-medium text-primary">管理</Text>
            <ChevronRight size={14} color="#6D4DFF" />
          </View>
        </View>
        <ScrollView scrollX enhanced showScrollbar={false} className="scrollbar-hide">
          <View className="flex gap-3 px-4 pb-1">
            {stocks.length === 0 ? (
              <View className="w-44 rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                <Text className="block text-sm text-on-surface-variant">暂无自选</Text>
                <Text className="block text-xs text-on-surface-variant text-opacity-70 mt-1">点击 + 添加股票</Text>
              </View>
            ) : (
              stocks.map((s) => {
                const pct = toNum(s.change_percent)
                const isUp = pct >= 0
                return (
                  <View
                    key={s.id}
                    className="shrink-0 w-44 rounded-2xl p-4 bg-white bg-opacity-72 border border-primary border-opacity-25"
                    onClick={() => Taro.navigateTo({ url: `/pages/stock/index?stock_id=${s.id}` })}
                  >
                    <View className="flex items-start justify-between gap-2">
                      <View className="min-w-0">
                        <Text className="block text-base font-semibold text-on-surface truncate">{s.name}</Text>
                        <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">{s.code}</Text>
                      </View>
                      {s.industry ? (
                        <View className="shrink-0 inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-primary-container">
                          <Text className="block text-[11px] font-medium text-primary">{s.industry}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="mt-3 flex items-end justify-between">
                      <Text className="block text-[22px] font-bold text-on-surface tabular-nums leading-none">
                        {formatPrice(s.current_price)}
                      </Text>
                      <View
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${isUp ? 'bg-success bg-opacity-10' : 'bg-error bg-opacity-10'}`}
                      >
                        <Text className={`block text-xs font-semibold ${isUp ? 'text-success' : 'text-error'}`}>
                          {isUp ? '▲' : '▼'} {formatPercent(s.change_percent)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </ScrollView>
      </View>

      {/* === 7. 最近观点 === */}
      <View className="mt-6 px-4">
        <View className="flex items-center justify-between mb-3">
          <Text className="block text-base font-semibold text-on-surface">最近观点</Text>
          <View className="text-xs font-medium text-primary inline-flex items-center gap-1"
            onClick={() => Taro.switchTab({ url: '/pages/library/index' })}
          >
            <Text className="block text-xs font-medium text-primary">全部</Text>
            <ChevronRight size={14} color="#6D4DFF" />
          </View>
        </View>
        <View className="space-y-3">
          {notes.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85 flex flex-col items-center">
              <Text className="block text-sm text-on-surface-variant">还没有观点记录</Text>
              <Text className="block text-xs text-on-surface-variant text-opacity-70 mt-1">点击右下角 + 立即记录</Text>
            </View>
          ) : (
            notes.map((n) => {
              const meta = directionMeta[n.direction] ?? directionMeta.neutral
              const cover = n.images?.[0]
              return (
                <View
                  key={n.id}
                  className="rounded-2xl p-4 flex gap-3 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.99] transition-transform"
                  onClick={() => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${n.id}` })}
                >
                  <View className="flex-1 min-w-0">
                    <View className="flex items-center gap-2 mb-2">
                      <View className={`inline-flex items-center px-2 py-1 rounded-full ${meta.bg}`}>
                        <Text className={`block text-[11px] font-semibold ${meta.text}`}>{meta.label}</Text>
                      </View>
                      <Text className="block text-xs text-on-surface-variant truncate">{n.stock_name}</Text>
                    </View>
                    <Text className="block text-base font-semibold text-on-surface leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {n.title}
                    </Text>
                    {n.content ? (
                      <Text
                        className="block text-sm text-on-surface-variant mt-1 leading-[1.5]"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {n.content}
                      </Text>
                    ) : null}
                    <View className="mt-2 flex items-center gap-3 text-[11px] text-on-surface-variant">
                      <View className="inline-flex items-center gap-1">
                        <Clock size={12} color="#5B5E72" />
                        <Text className="block text-[11px] text-on-surface-variant">{timeAgo(n.created_at)}</Text>
                      </View>
                    </View>
                  </View>
                  {cover ? (
                    <Image
                      src={cover}
                      mode="aspectFill"
                      className="w-14 h-14 rounded-xl shrink-0"
                    />
                  ) : (
                    <View
                      className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center bg-primary-container"
                    >
                      <Sparkles size={20} color="#6D4DFF" />
                    </View>
                  )}
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* === 8. 悬浮 + 按钮 === */}
      <View
        className="fixed right-5 z-30 w-14 h-14 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))', boxShadow: '0 0 0 1px rgba(109,77,255,0.30), 0 8px 24px rgba(109,77,255,0.18)' }}
        onClick={() => Taro.navigateTo({ url: '/pages/note-edit/index' })}
      >
        <Plus size={26} color="#ffffff" />
      </View>
    </View>
  )
}
