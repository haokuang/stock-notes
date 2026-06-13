import { View, Text } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Sparkles, Zap, TrendingUp, TrendingDown, FileText, ArrowUpRight } from 'lucide-react-taro'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
  notes_count?: number
}

interface Note {
  id: string
  stock_id: string
  stock_name: string
  title: string
  direction: 'bull' | 'bear' | 'neutral'
  content: string
  created_at: string
}

export default function AnalysisPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  const load = async () => {
    try {
      const [sRes, nRes] = await Promise.all([
        Network.request<{ data: Stock[] }>({ url: '/api/stocks' }),
        Network.request<{ data: Note[] }>({ url: '/api/notes?limit=20' }),
      ])
      console.log('[analysis] stocks', sRes.data)
      console.log('[analysis] notes', nRes.data)
      setStocks(sRes.data?.data ?? [])
      setRecentNotes(nRes.data?.data ?? [])
    } catch (e) {
      console.error('[analysis] load failed', e)
    }
  }

  useLoad(() => {
    load()
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const analyzeStock = async (stock: Stock) => {
    if (analyzing) return
    setAnalyzing(stock.id)
    Taro.showLoading({ title: 'AI 正在复盘...' })
    try {
      const notesRes = await Network.request<{ data: Note[] }>({
        url: `/api/notes?stock_id=${stock.id}&limit=50`,
      })
      const notes = notesRes.data?.data ?? []
      const res = await Network.request<{ data: any }>({
        url: '/api/ai/analyze-stock',
        method: 'POST',
        data: {
          stockCode: stock.code,
          stockName: stock.name,
          notes: notes.map((n) => ({
            title: n.title,
            content: n.content,
            direction: n.direction,
          })),
        },
      })
      console.log('[analysis] report', res.data)
      Taro.hideLoading()
      setAnalyzing(null)
      Taro.navigateTo({
        url: `/pages/ai-report/index?stock_id=${stock.id}&stock_name=${encodeURIComponent(stock.name)}&report=${encodeURIComponent(res.data?.data?.report ?? '')}`,
      })
    } catch (e) {
      Taro.hideLoading()
      setAnalyzing(null)
      console.error('[analysis] analyze failed', e)
      Taro.showToast({ title: '分析失败', icon: 'none' })
    }
  }

  // 按方向统计最近 20 条
  const bullCount = recentNotes.filter((n) => n.direction === 'bull').length
  const bearCount = recentNotes.filter((n) => n.direction === 'bear').length
  const neutralCount = recentNotes.filter((n) => n.direction === 'neutral').length

  return (
    <View className="w-full min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* Hero 区 */}
      <View className="px-4 pt-3 pb-4">
        <View
          className="rounded-2xl p-5 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)',
            boxShadow: '0 1px 2px rgba(20, 18, 60, 0.04), 0 6px 24px rgba(20, 18, 60, 0.10)',
          }}
        >
          <View className="flex items-center gap-2 mb-2">
            <View className="w-8 h-8 rounded-lg flex items-center justify-center bg-white bg-opacity-20">
              <Sparkles size={18} color="#ffffff" />
            </View>
            <Text className="block text-base font-semibold text-white">AI 智能投研</Text>
          </View>
          <Text className="block text-2xl font-bold text-white leading-tight">跨观点复盘</Text>
          <Text className="block text-sm text-white text-opacity-80 mt-2 leading-relaxed">
            基于你的历史观点，AI 自动汇总看多/看空/中性分布，{'\n'}提炼核心论点与潜在风险
          </Text>
          <View className="mt-3 flex items-center gap-2">
            <View className="px-3 py-1 rounded-full bg-white bg-opacity-15 flex items-center gap-2">
              <TrendingUp size={12} color="#ffffff" />
              <Text className="block text-[11px] font-semibold text-white">看多 {bullCount}</Text>
            </View>
            <View className="px-3 py-1 rounded-full bg-white bg-opacity-15 flex items-center gap-2">
              <TrendingDown size={12} color="#ffffff" />
              <Text className="block text-[11px] font-semibold text-white">看空 {bearCount}</Text>
            </View>
            <View className="px-3 py-1 rounded-full bg-white bg-opacity-15 flex items-center gap-2">
              <Zap size={12} color="#ffffff" />
              <Text className="block text-[11px] font-semibold text-white">中性 {neutralCount}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 选择股票 */}
      <View className="px-4">
        <View className="flex items-center justify-between mb-3">
          <Text className="block text-base font-semibold text-on-surface">选择股票生成报告</Text>
        </View>
        {stocks.length === 0 ? (
          <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-sm text-on-surface-variant text-center">先添加股票和观点</Text>
          </View>
        ) : (
          <View className="space-y-3">
            {stocks.map((s) => (
              <View
                key={s.id}
                className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-3 active:scale-[0.99] transition-transform"
                onClick={() => analyzeStock(s)}
              >
                <View className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
                  <Sparkles size={20} color="#6D4DFF" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="block text-sm font-semibold text-on-surface truncate">{s.name}</Text>
                  <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">
                    {s.code}{s.industry ? ` · ${s.industry}` : ''}
                  </Text>
                </View>
                {analyzing === s.id ? (
                  <View className="px-3 py-2 rounded-full bg-surface-container">
                    <Text className="block text-xs text-on-surface-variant">分析中...</Text>
                  </View>
                ) : (
                  <ArrowUpRight size={18} color="#5B5E72" />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 单图解读入口 */}
      <View className="px-4 mt-6">
        <View className="flex items-center justify-between mb-3">
          <Text className="block text-base font-semibold text-on-surface">单图解读</Text>
        </View>
        <View
          className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-3"
          onClick={() => Taro.navigateTo({ url: '/pages/image-ai/index' })}
        >
          <View className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
          >
            <FileText size={20} color="#ffffff" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="block text-sm font-semibold text-on-surface">上传截图 · AI 解读</Text>
            <Text className="block text-xs text-on-surface-variant mt-1">支持 K 线图、研报截图、新闻图</Text>
          </View>
          <ArrowUpRight size={18} color="#5B5E72" />
        </View>
      </View>
    </View>
  )
}
