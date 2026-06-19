import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { ArrowLeft, Sparkles, Share2, TrendingUp, TrendingDown, Activity, ExternalLink } from 'lucide-react-taro'
import { getAgentApi } from '@/agent/agent-client'
import type { AgentReportDetail } from '@/agent/agent-api'
import { Button } from '@/components/ui/button'
import {
  DailyBriefApiResult,
  normalizeDailyBrief,
} from '../prelaunch-navigation'

interface Brief {
  stock_code: string
  stock_name: string
  change_percent: number | null
  vs5d_avg_volume: number | null
  summary: string
  key_points: string[]
  search_results: { title: string; snippet: string; source: string; url: string }[]
  mock: boolean
  generated_at: string
}

export default function AiReportPage() {
  const [stockName, setStockName] = useState('')
  const [report, setReport] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [shareText, setShareText] = useState('')
  const [agentReport, setAgentReport] = useState<AgentReportDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useLoad(async (opts) => {
    if (opts?.report_id) {
      setLoading(true)
      try {
        const data = await getAgentApi().getReport(opts.report_id)
        setAgentReport(data)
        setStockName(data.stockName ?? data.title)
        setReport(data.content)
        setShareText(`【${data.title}】\n\n${data.content}`)
      } catch (e) {
        console.error('[ai-report] load agent report failed', e)
        Taro.showToast({ title: e instanceof Error ? e.message : '报告加载失败', icon: 'none' })
      } finally {
        setLoading(false)
      }
      return
    }
    // 兼容旧的 report 模式
    if (opts?.report) {
      setStockName(opts?.stock_name ? decodeURIComponent(opts.stock_name) : 'AI 报告')
      setReport(decodeURIComponent(opts.report))
      setShareText(decodeURIComponent(opts.report))
      return
    }
    // 新的 brief 模式
    if (opts?.brief) {
      try {
        const data = JSON.parse(decodeURIComponent(opts.brief)) as Brief
        setBrief(data)
        setStockName(data.stock_name ?? '今日简评')
        setShareText(`【${data.stock_name} 今日简评】\n\n${data.summary}\n\n${(data.key_points ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n')}`)
      } catch (e) {
        console.error('[ai-report] parse brief failed', e)
      }
      return
    }
    // 兼容 stock_id 直查
    if (opts?.stock_id) {
      try {
        const sRes = await Network.request<{ data: { code: string; name: string } }>({ url: `/api/stocks/${opts.stock_id}` })
        const stock = sRes.data?.data
        if (!stock) throw new Error('股票不存在')
        setStockName(stock.name)
        const bRes = await Network.request<{ data: DailyBriefApiResult }>({
          url: `/api/ai/daily-brief/${opts.stock_id}`,
        })
        const result = bRes.data?.data
        if (!result) throw new Error('简评返回为空')
        const data = normalizeDailyBrief(result, stock)
        setBrief(data)
        setShareText(`【${data.stock_name} 今日简评】\n\n${data.summary}\n\n${data.key_points.join('\n')}`)
      } catch (e) {
        console.error('[ai-report] load failed', e)
      }
    }
  })

  const onShare = () => {
    Taro.setClipboardData({ data: shareText })
    Taro.showToast({ title: '已复制到剪贴板', icon: 'success' })
  }

  const openCitation = (url: string) => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    Taro.setClipboardData({ data: url })
  }

  // 旧 report 模式分段渲染
  const sections = report
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const isUp = (brief?.change_percent ?? 0) >= 0

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      <View
        className="flex items-center justify-between px-4 pb-2 bg-background sticky top-0 z-40"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#161826" />
        </View>
        <Text className="block text-base font-semibold text-on-surface">{brief ? '今日简评' : agentReport ? '研究报告' : 'AI 投研报告'}</Text>
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onShare}>
          <Share2 size={18} color="#5B5E72" />
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* Brief 模式 */}
        {loading ? (
          <View className="px-4 py-16">
            <Text className="block text-center text-sm text-on-surface-variant">报告加载中…</Text>
          </View>
        ) : brief ? (
          <>
            <View className="px-4 pt-3">
              <View
                className="rounded-2xl p-4 overflow-hidden relative"
                style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #4A2EE0 100%)' }}
              >
                <View
                  className="absolute -top-12 left-1/2 w-80 h-32 pointer-events-none"
                  style={{ transform: 'translateX(-50%)', background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.20), transparent 70%)' }}
                />
                <View className="relative flex items-center gap-2 mb-2">
                  <View className="w-8 h-8 rounded-lg flex items-center justify-center bg-white bg-opacity-20">
                    <Sparkles size={18} color="#ffffff" />
                  </View>
                  <Text className="block text-base font-semibold text-white">{brief.stock_name}</Text>
                </View>
                <Text className="relative block text-xl font-bold text-white leading-tight">今日简评</Text>
                <View className="relative flex items-center gap-3 mt-3 flex-wrap">
                  <View className="px-3 py-2 rounded-full bg-white bg-opacity-20 flex items-center gap-1">
                    {isUp ? <TrendingUp size={12} color="#ffffff" /> : <TrendingDown size={12} color="#ffffff" />}
                    <Text className="block text-xs font-bold text-white tabular-nums">
                      {brief.change_percent != null ? `${isUp ? '+' : ''}${brief.change_percent.toFixed(2)}%` : '—'}
                    </Text>
                  </View>
                  {brief.vs5d_avg_volume != null && (
                    <View className="px-3 py-2 rounded-full bg-white bg-opacity-20 flex items-center gap-1">
                      <Activity size={12} color="#ffffff" />
                      <Text className="block text-xs font-semibold text-white tabular-nums">
                        vs 5 日均量 {brief.vs5d_avg_volume >= 0 ? '+' : ''}{brief.vs5d_avg_volume.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="relative block text-[11px] text-white text-opacity-80 mt-3 tabular-nums">
                  {new Date(brief.generated_at).toLocaleString('zh-CN')}
                </Text>
              </View>
            </View>

            {/* 简评正文 */}
            <View className="px-4 pt-3">
              <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                <View className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} color="#6D4DFF" />
                  <Text className="block text-sm font-semibold text-on-surface">AI 总结</Text>
                </View>
                <Text className="block text-sm text-on-surface leading-relaxed" style={{ wordBreak: 'break-word' }}>
                  {brief.summary}
                </Text>
              </View>
            </View>

            {/* 要点列表 */}
            {brief.key_points && brief.key_points.length > 0 && (
              <View className="px-4 pt-3">
                <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                  <Text className="block text-sm font-semibold text-on-surface mb-3">关键要点</Text>
                  <View className="space-y-2">
                    {brief.key_points.map((p, i) => (
                      <View key={i} className="flex items-start gap-2">
                        <View className="w-5 h-5 rounded-full bg-primary-container flex items-center justify-center shrink-0 mt-1">
                          <Text className="block text-[10px] font-bold text-primary">{i + 1}</Text>
                        </View>
                        <Text className="block text-sm text-on-surface leading-relaxed flex-1" style={{ wordBreak: 'break-word' }}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* 来源 */}
            {brief.search_results && brief.search_results.length > 0 && (
              <View className="px-4 pt-3">
                <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                  <Text className="block text-sm font-semibold text-on-surface mb-3">参考来源</Text>
                  <View className="space-y-2">
                    {brief.search_results.slice(0, 5).map((s, i) => (
                      <View key={i} className="py-2 border-b border-outline-variant border-opacity-30 last:border-0">
                        <Text className="block text-xs font-semibold text-on-surface">{s.title}</Text>
                        <Text className="block text-[11px] text-on-surface-variant mt-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {s.snippet}
                        </Text>
                        <Text className="block text-[10px] text-primary mt-1">{s.source}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {brief.mock && (
              <View className="px-4 pt-3">
                <View className="rounded-xl p-3 bg-warning bg-opacity-10">
                  <Text className="block text-[11px] text-warning">提示：当前 AI 处于 Mock 模式（缺少 API Key）</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {/* 旧 report 模式 */}
            <View className="px-4 pt-3">
              <View
                className="rounded-2xl p-4 overflow-hidden relative"
                style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
              >
                <View className="flex items-center gap-2 mb-2">
                  <View className="w-8 h-8 rounded-lg flex items-center justify-center bg-white bg-opacity-20">
                    <Sparkles size={18} color="#ffffff" />
                  </View>
                  <Text className="block text-base font-semibold text-white">{stockName}</Text>
                </View>
                <Text className="block text-xl font-bold text-white leading-tight">{agentReport?.title ?? '跨观点复盘报告'}</Text>
                <Text className="block text-xs text-white text-opacity-80 mt-2">{agentReport ? 'Agent 研究结论 · 来源可追溯' : '基于历史观点自动汇总'} · {new Date(agentReport?.createdAt ?? Date.now()).toLocaleDateString('zh-CN')}</Text>
              </View>
            </View>

            <View className="px-4 pt-3">
              <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                {sections.length === 0 ? (
                  <Text className="block text-sm text-on-surface-variant text-center py-6">暂无报告内容</Text>
                ) : (
                  sections.map((s, i) => {
                    const isHeading = /^#+\s|^【.+】/.test(s) || s.length < 30
                    return (
                      <View key={i} className={i > 0 ? 'mt-3' : ''}>
                        {isHeading ? (
                          <Text className="block text-sm font-semibold text-on-surface leading-relaxed" style={{ wordBreak: 'break-word' }}>{s}</Text>
                        ) : (
                          <Text className="block text-sm text-on-surface leading-relaxed whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{s}</Text>
                        )}
                      </View>
                    )
                  })
                )}
              </View>
            </View>
            {agentReport && agentReport.citations.length > 0 ? (
              <View className="px-4 pt-3">
                <View className="rounded-2xl border border-white border-opacity-85 bg-white bg-opacity-72 p-4">
                  <Text className="mb-2 block text-sm font-semibold text-on-surface">参考来源</Text>
                  {agentReport.citations.map((citation) => (
                    <Button key={citation.id} variant="ghost" className="h-auto w-full justify-between px-0 py-3" onClick={() => openCitation(citation.url)}>
                      <View className="mr-3 min-w-0 flex-1">
                        <Text className="block truncate text-left text-xs font-semibold">{citation.title || citation.source}</Text>
                        {citation.snippet ? <Text className="mt-1 block text-left text-xs text-on-surface-variant">{citation.snippet}</Text> : null}
                      </View>
                      <ExternalLink size={14} color="#6D4DFF" />
                    </Button>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
