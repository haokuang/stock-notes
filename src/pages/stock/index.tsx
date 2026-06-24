import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { Network } from '@/network'
import { EllipsisVertical, TrendingUp, Target, Shield, CirclePlus, Clock, RefreshCw, Sparkles, BookOpenCheck } from 'lucide-react-taro'
import { useBriefRealtime, type BriefEvent } from '@/hooks/useBriefRealtime'
import { useStockRefresh } from '@/hooks/useStockRefresh'
import { getAgentApi } from '@/agent/agent-client'
import type { AgentReportSummary } from '@/agent/agent-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { ResponsivePage } from '@/components/layout/responsive-page'
import type { SubjectType } from '@/stocks/subject'
import { detailCapabilities, detailRequestUrls } from './stock-detail-logic'

interface Stock {
  id: string
  code: string
  name: string
  subject_type: SubjectType
  industry: string | null
  current_price: number | null
  change_percent: number | null
  open_price: number | null
  high_price: number | null
  low_price: number | null
  pre_close: number | null
  price_date: string | null
  // 实时价时间(后端 refreshPrice 返回;首次进入页面时可能为空,需要点击"刷新"或读取缓存)
  price_time?: string | null
  price_time_label?: string | null
  is_realtime?: boolean
  // 状态机字段
  status: 'watching' | 'holding'
  entry_price: number | null
  loss_rate: number | null
  entered_at: string | null
}

interface StopLossAlert {
  status: 'inactive' | 'ok' | 'warning' | 'danger' | 'triggered'
  actual_rate: number
  threshold: number | null
  distance_to_trigger: number | null
  entry_price?: number
  current_price?: number
  message: string
}

interface StockBriefRow {
  id: string
  trade_date: string
  signal: 'green' | 'yellow' | 'red'
  content?: string  // 2026-06-14 重构后:100 字主简评(后端存在 technical_analysis 字段,前端用 content 兼容)
  technical_analysis?: string
  logic_judgment?: string
  action: 'hold' | 'review' | 'sell'
  sell_reasons: string[]
  evidence_note_ids: string[]
  price_at_brief: string | null
  stop_loss_triggered: string | boolean
  created_at: string
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
  const [stopLoss, setStopLoss] = useState<StopLossAlert | null>(null)
  const [briefs, setBriefs] = useState<StockBriefRow[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, avg_entry_price: null, avg_target_price: null, avg_stop_loss: null })
  const [distribution, setDistribution] = useState<Distribution>({ bull: 0, bear: 0, neutral: 0 })
  const [stockId, setStockId] = useState('')
  const [briefing, setBriefing] = useState(false)
  const [agentReports, setAgentReports] = useState<AgentReportSummary[]>([])
  const autoRefreshedStockId = useRef('')

  const load = async (sid: string): Promise<Stock | null> => {
    if (!sid) return null
    try {
      const sRes = await Network.request<{ data: Stock }>({ url: `/api/stocks/${sid}` })
      const loadedStock = sRes.data?.data
      if (!loadedStock) return null

      setStock(loadedStock)
      Taro.setNavigationBarTitle({
        title: loadedStock.subject_type === 'market' ? '大盘研究' : '股票详情',
      })

      const urls = detailRequestUrls(loadedStock.subject_type, sid)
      const responses = await Promise.all(
        urls.map((url) => Network.request<{ data: unknown }>({ url })),
      )
      setNotes((responses[0].data?.data as Note[] | undefined) ?? [])
      setSummary((responses[1].data?.data as Summary | undefined) ?? {
        total: 0,
        avg_entry_price: null,
        avg_target_price: null,
        avg_stop_loss: null,
      })
      setDistribution((responses[2].data?.data as Distribution | undefined) ?? {
        bull: 0,
        bear: 0,
        neutral: 0,
      })
      if (loadedStock.subject_type === 'stock') {
        setStopLoss((responses[3].data?.data as StopLossAlert | undefined) ?? null)
        setBriefs((responses[4].data?.data as StockBriefRow[] | undefined) ?? [])
      } else {
        setStopLoss(null)
        setBriefs([])
      }
      getAgentApi().listReports(sid)
        .then(setAgentReports)
        .catch((cause) => console.error('[stock] agent reports failed', cause))
      return loadedStock
    } catch (e) {
      console.error('[stock] load failed', e)
      return null
    }
  }

  useLoad((opts) => {
    const sid = opts?.stock_id ?? ''
    setStockId(sid)
    Taro.setNavigationBarTitle({ title: '股票详情' })
    load(sid)
  })

  // 每次页面显示都重新拉取(包括从 buy 页面回来时,状态从 watching → holding)— 2026-06-14
  useDidShow(() => {
    if (stockId) load(stockId)
  })

  // Realtime 订阅:新 brief 来时合并到列表 + 滚动到顶
  useBriefRealtime({
    stockId: stock?.subject_type === 'stock' ? stockId : null,
    onBrief: (b: BriefEvent) => {
      setBriefs((prev) => {
        // 去重:同 id 替换,新 id 插头部
        const idx = prev.findIndex((x) => x.id === b.id)
        const next =
          idx >= 0
            ? prev.map((x, i) => (i === idx ? { ...x, ...(b as any) } : x))
            : [b as any, ...prev]
        return next.slice(0, 7)  // 只留 7 天
      })
      // 新 brief 出现时滚到顶部
      Taro.pageScrollTo({ scrollTop: 0, duration: 300 }).catch(() => {})
    },
  })

  usePullDownRefresh(async () => {
    await load(stockId)
    Taro.stopPullDownRefresh()
  })

  const goAdd = (asDoc: 'note' | 'doc' = 'note') => Taro.navigateTo({ url: `/pages/note-edit/index?stock_id=${stockId}&type=${asDoc}` })
  const goNote = (id: string) => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${id}` })
  const openAgent = async () => {
    if (!stockId) return
    try {
      const api = getAgentApi()
      const thread = await api.getThread(stockId) ?? await api.createThread(stockId)
      Taro.navigateTo({ url: `/pages/agent-chat/index?thread_id=${encodeURIComponent(thread.id)}&stock_id=${encodeURIComponent(stockId)}&stock_name=${encodeURIComponent(stock?.name ?? '')}&subject_type=${stock?.subject_type ?? 'stock'}` })
    } catch (cause) {
      Taro.showToast({ title: cause instanceof Error ? cause.message : '研究助手暂不可用', icon: 'none' })
    }
  }

  // 实时价格刷新(含 1 分钟限频 + 倒计时)
  const refreshStockId = stock?.subject_type === 'stock' ? stockId : null
  const refresh = useStockRefresh(refreshStockId)

  useEffect(() => {
    if (!refreshStockId || autoRefreshedStockId.current === refreshStockId) return
    autoRefreshedStockId.current = refreshStockId
    const timer = setTimeout(() => {
      refresh.sync({ silent: true }).then((result) => {
        if (result) load(refreshStockId)
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [refreshStockId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onRefreshPrice = async () => {
    if (stock?.subject_type !== 'stock') return
    const r = await refresh.sync()
    if (r) await load(stockId)
  }

  const onAiBrief = async () => {
    if (!stockId || briefing || stock?.subject_type !== 'stock') return
    setBriefing(true)
    Taro.showLoading({ title: '拉取行情中...' })
    try {
      // 1. 先静默刷一次价格(冷却中会跳过,不会阻塞)
      await refresh.sync({ silent: true })

      // 2. 走"每日简评"端点(2026-06-14 重构:100 字单段 + LLM 判色,落 stock_briefs + 笔记)
      Taro.showLoading({ title: 'AI 分析中...' })
      const res = await Network.request<{ data: { brief: StockBriefRow; noteId: string | null } }>({
        url: `/api/stocks/${stockId}/brief/generate`,
        method: 'POST',
      })
      Taro.hideLoading()
      const brief = res.data?.data?.brief
      if (brief) {
        // 刷新本页的 briefs 时间线
        await load(stockId)
        Taro.showToast({ title: '已生成', icon: 'success' })
        if (brief.signal === 'red') {
          Taro.showModal({
            title: '⚠️ 警惕信号',
            content: brief.content || brief.technical_analysis || '触及止损或技术破位',
          })
        }
      } else {
        Taro.showToast({ title: '生成失败', icon: 'none' })
      }
    } catch (e: any) {
      Taro.hideLoading()
      console.error('[stock] ai brief failed', e)
      Taro.showToast({ title: e?.data?.message ?? '生成失败', icon: 'none' })
    } finally {
      setBriefing(false)
    }
  }

  const isUp = (stock?.change_percent ?? 0) >= 0
  const capabilities = detailCapabilities(stock?.subject_type ?? 'stock')
  const marketMode = stock?.subject_type === 'market'

  return (
    <View className="w-full min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* 自定义 Header */}
      <PageHeader
        title={stock?.name ?? '加载中...'}
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container">
            <EllipsisVertical size={20} color="#5B5E72" />
          </View>
        }
      />

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        <ResponsivePage padded={false}>
        {/* Hero 区 */}
        {stock && (
          marketMode ? (
            <View className="px-4 pt-3">
              <Card>
                <CardContent className="p-5">
                  <View className="flex items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <View className="flex items-center gap-2">
                        <Text className="block text-2xl font-bold leading-tight text-on-surface">
                          {stock.name}
                        </Text>
                        <Badge variant="secondary">
                          <Text className="block text-xs font-semibold">市场研究</Text>
                        </Badge>
                      </View>
                      <Text className="mt-3 block text-sm leading-relaxed text-on-surface-variant">
                        聚焦指数表现、市场宽度、成交额、行业轮动、资金与情绪
                      </Text>
                    </View>
                    <Button size="sm" onClick={openAgent}>
                      <Sparkles size={14} color="#ffffff" />
                      <Text className="block text-xs font-semibold text-white">问 AI</Text>
                    </Button>
                  </View>
                </CardContent>
              </Card>
            </View>
          ) : (
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
                <View className="flex-1 min-w-0">
                  <Text className="block text-2xl font-bold text-on-surface leading-tight">{stock.name}</Text>
                  <View className="flex items-center gap-2 mt-2 flex-wrap">
                    <Text className="block text-xs text-on-surface-variant tabular-nums">{stock.code}</Text>
                    {stock.industry && (
                      <View className="px-2 py-1 rounded-full" style={{ background: '#ECE7FF' }}>
                        <Text className="block text-xs font-semibold text-primary">{stock.industry}</Text>
                      </View>
                    )}
                    {stock.price_date && (
                      <Text className="block text-xs text-on-surface-variant">{stock.price_date}</Text>
                    )}
                  </View>
                </View>
              </View>
              <View className="relative mt-4 flex items-end gap-2 flex-wrap">
                <Text className="block text-3xl font-bold text-on-surface tabular-nums leading-none">
                  {stock.current_price != null ? Number(stock.current_price).toFixed(2) : '—'}
                </Text>
                <View
                  className="px-2 py-1 rounded-full"
                  style={{ background: isUp ? 'rgba(15, 140, 102, 0.10)' : 'rgba(209, 26, 74, 0.10)' }}
                >
                  <Text className="block text-xs font-bold tabular-nums" style={{ color: isUp ? '#0F8C66' : '#D11A4A' }}>
                    {stock.change_percent != null ? `${isUp ? '+' : ''}${Number(stock.change_percent).toFixed(2)}%` : '—'}
                  </Text>
                </View>
              </View>
              {/* 价格时间标签:今日 HH:mm / 今日收盘 / 昨日收盘 / MM-DD */}
              <View className="mt-2 flex items-center gap-1">
                <Clock size={11} color="#5B5E72" />
                <Text className="block text-xs text-on-surface-variant tabular-nums">
                  {refresh.lastRefresh?.price_time_label ?? stock.price_time_label ?? '—'}
                </Text>
                {refresh.lastRefresh && !refresh.lastRefresh.is_realtime ? (
                  <View className="px-1 py-1 rounded" style={{ background: 'rgba(91, 94, 114, 0.10)' }}>
                    <Text className="block text-xs font-medium text-on-surface-variant">非实时</Text>
                  </View>
                ) : null}
              </View>

              {/* === 操作按钮行:刷新价格 + 生成今日简评 === */}
              <View className="mt-3 flex items-center gap-2">
                <View
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border"
                  style={{
                    backgroundColor: refresh.cooldownLeft > 0 ? 'rgba(91, 94, 114, 0.10)' : 'rgba(255, 255, 255, 0.72)',
                    borderColor: refresh.cooldownLeft > 0 ? 'rgba(91, 94, 114, 0.20)' : 'rgba(91, 94, 114, 0.30)',
                    opacity: refresh.cooldownLeft > 0 ? 0.5 : 1,
                  }}
                  onClick={refresh.cooldownLeft > 0 ? undefined : onRefreshPrice}
                >
                  <RefreshCw
                    size={14}
                    color={refresh.cooldownLeft > 0 ? '#9498AC' : '#5B5E72'}
                    style={{
                      transform: refresh.refreshing ? 'rotate(360deg)' : 'none',
                      transition: 'transform 0.6s linear',
                    }}
                  />
                  <Text
                    className="block text-xs font-semibold"
                    style={{ color: refresh.cooldownLeft > 0 ? '#9498AC' : '#161826' }}
                  >
                    {refresh.refreshing ? '同步中…' : '刷新价格'}
                  </Text>
                </View>
                <View
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-primary"
                  style={{ opacity: briefing ? 0.6 : 1 }}
                  onClick={onAiBrief}
                >
                  <Sparkles size={14} color="#ffffff" />
                  <Text className="block text-xs font-semibold text-white">
                    {briefing ? '生成中…' : '✨ 生成今日简评'}
                  </Text>
                </View>
              </View>

              {/* === 状态机卡片 === */}
              <View
                className="mt-4 rounded-2xl p-3 flex items-center justify-between"
                style={{ background: stock.status === 'holding' ? 'rgba(15, 140, 102, 0.08)' : 'rgba(109, 77, 255, 0.06)' }}
              >
                <View className="flex items-center gap-2">
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ background: stock.status === 'holding' ? '#0F8C66' : '#9498AC' }}
                  />
                  <Text className="block text-sm font-semibold" style={{ color: stock.status === 'holding' ? '#0F8C66' : '#5B5E72' }}>
                    {stock.status === 'holding' ? '持有中' : '观察中'}
                  </Text>
                  {stock.status === 'holding' && stock.entered_at ? (
                    <Text className="block text-xs text-on-surface-variant">
                      · 自 {stock.entered_at.slice(0, 10)} 起
                    </Text>
                  ) : null}
                </View>
                <View
                  className="px-4 py-2 rounded-lg"
                  style={{
                    background: stock.status === 'holding' ? '#D11A4A' : '#6D4DFF',
                  }}
                  onClick={() => {
                    if (stock.status === 'holding') {
                      Taro.showModal({
                        title: '确认卖出',
                        content: '卖出后股票回到观察状态,需重新填写买入信息',
                        success: async (r) => {
                          if (r.confirm) {
                            try {
                              await Network.request({
                                url: `/api/stocks/${stockId}/sell`,
                                method: 'POST',
                                data: {},
                              })
                              Taro.showToast({ title: '已卖出', icon: 'success' })
                              load(stockId)
                            } catch (e: any) {
                              Taro.showToast({ title: e?.data?.message ?? '卖出失败', icon: 'none' })
                            }
                          }
                        },
                      })
                    } else {
                      Taro.navigateTo({ url: `/pages/buy/index?stock_id=${stockId}` })
                    }
                  }}
                >
                  <Text className="block text-xs font-semibold text-white">
                    {stock.status === 'holding' ? '卖出' : '我已买入'}
                  </Text>
                </View>
              </View>

              {/* === 持仓三件套(仅 holding 状态) === */}
              {stock.status === 'holding' && stock.entry_price != null && (
                <View className="mt-3 rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                  <Text className="block text-xs font-semibold text-on-surface-variant mb-2">持仓三件套</Text>
                  <View className="grid grid-cols-3 gap-2">
                    <View>
                      <Text className="block text-xs text-on-surface-variant">买入价</Text>
                      <Text className="block text-sm font-semibold text-on-surface tabular-nums">¥{Number(stock.entry_price).toFixed(2)}</Text>
                    </View>
                    <View>
                      <Text className="block text-xs text-on-surface-variant">亏损率上限</Text>
                      <Text className="block text-sm font-semibold text-on-surface tabular-nums">{Number(stock.loss_rate ?? 0).toFixed(1)}%</Text>
                    </View>
                    <View>
                      <Text className="block text-xs text-on-surface-variant">止损价</Text>
                      <Text className="block text-sm font-semibold tabular-nums" style={{ color: '#D11A4A' }}>
                        ¥{((Number(stock.entry_price) * (100 - Number(stock.loss_rate ?? 0))) / 100).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* === 止损进度条(仅 holding + 有 alert) === */}
              {stopLoss && stopLoss.status !== 'inactive' && (
                <View
                  className="mt-3 rounded-2xl p-3 border"
                  style={{
                    background:
                      stopLoss.status === 'triggered'
                        ? 'rgba(209, 26, 74, 0.10)'
                        : stopLoss.status === 'danger'
                          ? 'rgba(255, 122, 0, 0.10)'
                          : stopLoss.status === 'warning'
                            ? 'rgba(255, 184, 0, 0.10)'
                            : 'rgba(15, 140, 102, 0.08)',
                    borderColor:
                      stopLoss.status === 'triggered'
                        ? 'rgba(209, 26, 74, 0.30)'
                        : stopLoss.status === 'danger'
                          ? 'rgba(255, 122, 0, 0.30)'
                          : stopLoss.status === 'warning'
                            ? 'rgba(255, 184, 0, 0.30)'
                            : 'rgba(15, 140, 102, 0.30)',
                  }}
                >
                  <View className="flex items-center justify-between mb-2">
                    <Text
                      className="block text-xs font-semibold"
                      style={{
                        color:
                          stopLoss.status === 'triggered'
                            ? '#D11A4A'
                            : stopLoss.status === 'danger'
                              ? '#FF7A00'
                              : stopLoss.status === 'warning'
                                ? '#FFB800'
                                : '#0F8C66',
                      }}
                    >
                      {stopLoss.status === 'triggered' ? '⚠️ 触及止损' : stopLoss.status === 'danger' ? '警告' : stopLoss.status === 'warning' ? '注意' : '安全'}
                    </Text>
                    <Text className="block text-xs text-on-surface-variant tabular-nums">
                      实际 {stopLoss.actual_rate.toFixed(2)}% / 上限 {stopLoss.threshold}%
                    </Text>
                  </View>
                  <View className="h-2 rounded-full bg-white bg-opacity-50 overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, (stopLoss.actual_rate / stopLoss.threshold!) * 100))}%`,
                        background:
                          stopLoss.status === 'triggered'
                            ? '#D11A4A'
                            : stopLoss.status === 'danger'
                              ? '#FF7A00'
                              : stopLoss.status === 'warning'
                                ? '#FFB800'
                                : '#0F8C66',
                      }}
                    />
                  </View>
                  <Text className="block text-xs text-on-surface-variant mt-1">{stopLoss.message}</Text>
                </View>
              )}

              {/* === 每日简评时间线 === */}
              {briefs.length > 0 && (
                <View className="mt-3 rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                  <View className="flex items-center justify-between mb-3">
                    <Text className="block text-sm font-semibold text-on-surface">每日简评</Text>
                    <Text
                      className="block text-xs text-primary"
                      onClick={onAiBrief}
                    >
                      {briefing ? '生成中…' : '🔄 重新生成'}
                    </Text>
                  </View>
                  <View className="space-y-2">
                    {briefs.map((b) => {
                      const colorMap: Record<string, string> = {
                        green: '#0F8C66',
                        yellow: '#FFB800',
                        red: '#D11A4A',
                      }
                      const signalLabel: Record<string, string> = {
                        green: '继续持有',
                        yellow: '需要复核',
                        red: '警惕信号',
                      }
                      const c = colorMap[b.signal] ?? '#9498AC'
                      const briefText = b.content || b.technical_analysis || ''
                      return (
                        <View
                          key={b.id}
                          className="rounded-lg p-3"
                          style={{ background: `${c}10`, borderLeft: `3px solid ${c}` }}
                        >
                          <View className="flex items-center justify-between mb-1">
                            <Text className="block text-xs font-semibold tabular-nums" style={{ color: c }}>
                              {b.trade_date} · {signalLabel[b.signal] ?? b.signal}
                            </Text>
                            {b.stop_loss_triggered === 't' || b.stop_loss_triggered === true ? (
                              <Text className="block text-xs text-error">⚠ 止损</Text>
                            ) : null}
                          </View>
                          <Text className="block text-xs text-on-surface leading-relaxed">{briefText}</Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* 今日行情 OHLCV */}
              {stock.open_price != null && (
                <View className="relative mt-4 pt-3 border-t border-outline-variant border-opacity-30 grid grid-cols-4 gap-2">
                  <View>
                    <Text className="block text-xs text-on-surface-variant">开盘</Text>
                    <Text className="block text-xs font-semibold text-on-surface tabular-nums">{Number(stock.open_price).toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-xs text-on-surface-variant">最高</Text>
                    <Text className="block text-xs font-semibold tabular-nums" style={{ color: '#D11A4A' }}>{Number(stock.high_price)?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-xs text-on-surface-variant">最低</Text>
                    <Text className="block text-xs font-semibold tabular-nums" style={{ color: '#0F8C66' }}>{Number(stock.low_price)?.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text className="block text-xs text-on-surface-variant">昨收</Text>
                    <Text className="block text-xs font-semibold text-on-surface tabular-nums">{Number(stock.pre_close)?.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
          )
        )}

        {/* 操作按钮行:刷新价格 + AI 简评已在 hero 区域下方,这里放"新增观点 / 上传文档" */}
        {stock && (
          <View className="px-4 mt-2">
            <View className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => goAdd('note')}
              >
                <CirclePlus size={14} color="#6D4DFF" />
                <Text className="block text-xs font-semibold text-on-surface">新增观点</Text>
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => goAdd('doc')}
              >
                <Text className="block text-xs font-semibold text-on-surface">上传文档</Text>
              </Button>
            </View>
          </View>
        )}

        {/* 价格快照 */}
        {stock && capabilities.price && (
          <View className="px-4 mt-4">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="grid grid-cols-3 gap-3">
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <TrendingUp size={16} color="#6D4DFF" />
                    <Text className="block text-sm text-on-surface-variant">入场均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_entry_price != null ? Number(summary.avg_entry_price).toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-xs text-on-surface-variant mt-2">{summary.total} 条</Text>
                </View>
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <Target size={16} color="#0F8C66" />
                    <Text className="block text-sm text-on-surface-variant">目标均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_target_price != null ? Number(summary.avg_target_price).toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-xs text-on-surface-variant mt-2">{summary.total} 条</Text>
                </View>
                <View className="flex flex-col">
                  <View className="flex items-center gap-2">
                    <Shield size={16} color="#D11A4A" />
                    <Text className="block text-sm text-on-surface-variant">止损均价</Text>
                  </View>
                  <Text className="block text-lg font-bold text-on-surface tabular-nums mt-2 leading-none">
                    {summary.avg_stop_loss != null ? Number(summary.avg_stop_loss).toFixed(2) : '—'}
                  </Text>
                  <Text className="block text-xs text-on-surface-variant mt-2">{summary.total} 条</Text>
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
              <View className="flex items-center justify-between mt-3 text-xs text-on-surface-variant">
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

        {/* Agent 研究报告 */}
        <View className="mt-4 px-4">
          <View className="mb-3 flex items-center justify-between gap-3">
            <Text className="block text-base font-semibold text-on-surface">Agent 研究报告</Text>
            <Button size="sm" variant="outline" onClick={openAgent}>
              <Sparkles size={14} color="#6D4DFF" />
              <Text>继续研究</Text>
            </Button>
          </View>
          {agentReports.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-center">
                <Text className="block text-sm text-on-surface-variant">还没有沉淀报告，可先与研究 Agent 对话</Text>
              </CardContent>
            </Card>
          ) : (
            <View className="space-y-3">
              {agentReports.map((reportItem) => (
                <Card key={reportItem.id} onClick={() => Taro.navigateTo({ url: `/pages/ai-report/index?report_id=${encodeURIComponent(reportItem.id)}` })}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
                      <BookOpenCheck size={19} color="#6D4DFF" />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="block truncate text-sm font-semibold text-on-surface">{reportItem.title}</Text>
                      <Text className="mt-1 block text-xs text-on-surface-variant">{new Date(reportItem.createdAt).toLocaleDateString('zh-CN')}</Text>
                    </View>
                  </CardContent>
                </Card>
              ))}
            </View>
          )}
        </View>

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
                          <Text className="block text-xs font-semibold" style={{ color: '#0F8C66' }}>文档</Text>
                        </View>
                      ) : (
                        <View
                          className="px-2 py-1 rounded-full"
                          style={{
                            background: n.direction === 'bull' ? 'rgba(15, 140, 102, 0.10)' : n.direction === 'bear' ? 'rgba(209, 26, 74, 0.10)' : 'rgba(180, 83, 9, 0.10)',
                          }}
                        >
                          <Text
                            className="block text-xs font-semibold"
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
                    <View className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                      <View className="flex items-center gap-1">
                        <Clock size={12} color="#5B5E72" />
                        <Text className="block">{n.created_at?.slice(0, 10)}</Text>
                      </View>
                      {!isDoc && capabilities.price && (n.entry_price || n.target_price || n.stop_loss) && (
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
        </ResponsivePage>
      </ScrollView>
    </View>
  )
}
