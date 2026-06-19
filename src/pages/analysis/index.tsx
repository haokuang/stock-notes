import { Text, View } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { ArrowUpRight, FileText, MessageSquareText, Sparkles, TrendingDown, TrendingUp, Zap } from 'lucide-react-taro'
import { useState } from 'react'
import { getAgentApi } from '@/agent/agent-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Network } from '@/network'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
}

interface Note {
  id: string
  direction: 'bull' | 'bear' | 'neutral'
}

export default function AnalysisPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [openingStockId, setOpeningStockId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [stockResponse, noteResponse] = await Promise.all([
        Network.request<{ data: Stock[] }>({ url: '/api/stocks' }),
        Network.request<{ data: Note[] }>({ url: '/api/notes?limit=20' }),
      ])
      console.log('[analysis] stocks', stockResponse.data)
      console.log('[analysis] notes', noteResponse.data)
      setStocks(stockResponse.data?.data ?? [])
      setRecentNotes(noteResponse.data?.data ?? [])
    } catch (cause) {
      console.error('[analysis] load failed', cause)
      Taro.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useLoad(load)
  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const openAgent = async (stock: Stock) => {
    if (openingStockId) return
    setOpeningStockId(stock.id)
    try {
      const api = getAgentApi()
      const thread = await api.getThread(stock.id) ?? await api.createThread(stock.id)
      await Taro.navigateTo({
        url: `/pages/agent-chat/index?thread_id=${encodeURIComponent(thread.id)}&stock_id=${encodeURIComponent(stock.id)}&stock_name=${encodeURIComponent(stock.name)}`,
      })
    } catch (cause) {
      console.error('[analysis] open agent failed', cause)
      Taro.showToast({ title: cause instanceof Error ? cause.message : '暂时无法打开研究助手', icon: 'none' })
    } finally {
      setOpeningStockId(null)
    }
  }

  const bullCount = recentNotes.filter((note) => note.direction === 'bull').length
  const bearCount = recentNotes.filter((note) => note.direction === 'bear').length
  const neutralCount = recentNotes.filter((note) => note.direction === 'neutral').length

  return (
    <View className="min-h-full w-full bg-[#EEF0F6] pb-24">
      <View className="px-4 pb-4 pt-3">
        <View className="overflow-hidden rounded-2xl bg-primary p-5 shadow-lg">
          <View className="mb-2 flex items-center gap-2">
            <View className="flex h-8 w-8 items-center justify-center rounded-lg bg-white bg-opacity-20">
              <Sparkles size={18} color="#ffffff" />
            </View>
            <Text className="block text-base font-semibold text-white">股票研究 Agent</Text>
          </View>
          <Text className="block text-2xl font-bold leading-tight text-white">从观点到可追溯结论</Text>
          <Text className="mt-2 block text-sm leading-relaxed text-white text-opacity-80">
            结合你的历史笔记与联网资料，持续追问、核验来源，{`\n`}最后沉淀成可保存的研究报告
          </Text>
          <View className="mt-4 flex items-center gap-2">
            <View className="flex items-center gap-1 rounded-full bg-white bg-opacity-20 px-3 py-1">
              <TrendingUp size={12} color="#ffffff" />
              <Text className="block text-xs font-bold text-white">看多 {bullCount}</Text>
            </View>
            <View className="flex items-center gap-1 rounded-full bg-white bg-opacity-20 px-3 py-1">
              <TrendingDown size={12} color="#ffffff" />
              <Text className="block text-xs font-bold text-white">看空 {bearCount}</Text>
            </View>
            <View className="flex items-center gap-1 rounded-full bg-white bg-opacity-20 px-3 py-1">
              <Zap size={12} color="#ffffff" />
              <Text className="block text-xs font-bold text-white">中性 {neutralCount}</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="px-4">
        <Text className="mb-3 block text-base font-semibold text-on-surface">选择研究标的</Text>
        {loading ? (
          <View className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </View>
        ) : stocks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Text className="block text-sm text-on-surface-variant">先在首页添加一只股票，再开始研究</Text>
            </CardContent>
          </Card>
        ) : (
          <View className="space-y-3">
            {stocks.map((stock) => (
              <Card key={stock.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
                    <MessageSquareText size={20} color="#6D4DFF" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="block truncate text-sm font-semibold text-on-surface">{stock.name}</Text>
                    <Text className="mt-1 block text-xs text-on-surface-variant">
                      {stock.code}{stock.industry ? ` · ${stock.industry}` : ''}
                    </Text>
                  </View>
                  <Button size="sm" disabled={openingStockId !== null} onClick={() => openAgent(stock)}>
                    <Text>{openingStockId === stock.id ? '打开中' : '开始研究'}</Text>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>

      <View className="mt-6 px-4">
        <Text className="mb-3 block text-base font-semibold text-on-surface">单图解读</Text>
        <Card onClick={() => Taro.navigateTo({ url: '/pages/image-ai/index' })}>
          <CardContent className="flex items-center gap-3 p-4">
            <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <FileText size={20} color="#ffffff" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="block text-sm font-semibold text-on-surface">上传截图 · AI 解读</Text>
              <Text className="mt-1 block text-xs text-on-surface-variant">支持 K 线图、研报截图、新闻图</Text>
            </View>
            <ArrowUpRight size={18} color="#5B5E72" />
          </CardContent>
        </Card>
      </View>
    </View>
  )
}
