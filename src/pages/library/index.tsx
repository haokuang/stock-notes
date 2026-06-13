import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { PenLine, Search, FileText } from 'lucide-react-taro'

interface Note {
  id: string
  stock_id: string
  stock_code: string
  stock_name: string
  type: 'note' | 'doc'
  title: string
  content: string | null
  direction: 'bull' | 'bear' | 'neutral' | null
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

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
}

const directionMeta = {
  bull: { label: '看多', bg: 'bg-success bg-opacity-15', text: 'text-success' },
  bear: { label: '看空', bg: 'bg-error bg-opacity-15', text: 'text-error' },
  neutral: { label: '中性', bg: 'bg-warning bg-opacity-15', text: 'text-warning' },
}

const typeMeta = {
  note: { label: '观点', color: '#6D4DFF', bg: 'rgba(109, 77, 255, 0.10)' },
  doc: { label: '文档', color: '#0F8C66', bg: 'rgba(15, 140, 102, 0.10)' },
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

export default function LibraryPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [typeFilter, setTypeFilter] = useState<'all' | 'note' | 'doc'>('all')
  const [filter, setFilter] = useState<'all' | 'bull' | 'bear' | 'neutral'>('all')
  const [stockId, setStockId] = useState<string>('')

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (stockId) params.set('stock_id', stockId)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (filter !== 'all') params.set('direction', filter)
    params.set('limit', '100')
    return `/api/notes?${params.toString()}`
  }

  const load = async () => {
    try {
      const [nRes, sRes] = await Promise.all([
        Network.request<{ data: Note[] }>({ url: buildUrl() }),
        Network.request<{ data: Stock[] }>({ url: '/api/stocks' }),
      ])
      console.log('[library] notes', nRes.data)
      console.log('[library] stocks', sRes.data)
      setNotes(nRes.data?.data ?? [])
      setStocks(sRes.data?.data ?? [])
    } catch (e) {
      console.error('[library] load failed', e)
    }
  }

  useLoad(() => {
    load()
  })

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const typeTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'note' as const, label: '观点' },
    { key: 'doc' as const, label: '文档' },
  ]

  const dirTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'bull' as const, label: '看多' },
    { key: 'bear' as const, label: '看空' },
    { key: 'neutral' as const, label: '中性' },
  ]

  return (
    <View className="w-full min-h-full pb-[calc(4rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* 顶部搜索栏 */}
      <View className="sticky top-0 z-30 px-4 py-3 bg-background bg-opacity-80 backdrop-blur-md">
        <View className="flex items-center gap-2 px-3 h-10 rounded-full bg-white bg-opacity-72 border border-white border-opacity-85"
          onClick={() => Taro.navigateTo({ url: '/pages/stock-search/index' })}
        >
          <Search size={16} color="#5B5E72" />
          <Text className="block text-sm text-on-surface-variant">搜索股票代码 / 名称</Text>
        </View>
      </View>

      {/* 类型筛选 Tab：全部 / 观点 / 文档 */}
      <View className="px-4 mb-3">
        <View className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {typeTabs.map((t) => (
            <View
              key={t.key}
              className={`shrink-0 px-4 py-2 rounded-full ${
                typeFilter === t.key
                  ? 'bg-primary text-white'
                  : 'bg-white bg-opacity-72 border border-white border-opacity-85'
              }`}
              onClick={() => setTypeFilter(t.key)}
            >
              <Text className={`block text-sm font-medium ${typeFilter === t.key ? 'text-white' : 'text-on-surface-variant'}`}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 方向筛选 Tab（仅观点模式） */}
      {typeFilter !== 'doc' && (
        <View className="px-4 mb-3">
          <View className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {dirTabs.map((t) => (
              <View
                key={t.key}
                className={`shrink-0 px-3 py-2 rounded-full text-xs ${
                  filter === t.key
                    ? 'bg-primary-container text-primary'
                    : 'bg-white bg-opacity-72 text-on-surface-variant border border-white border-opacity-85'
                }`}
                onClick={() => setFilter(t.key)}
              >
                <Text className={`block text-xs font-medium ${filter === t.key ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
                  {t.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 股票过滤横滚 */}
      {stocks.length > 0 && (
        <View className="px-4 mb-3">
          <View className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <View
              className={`shrink-0 px-3 py-2 rounded-full text-xs ${!stockId ? 'bg-primary-container' : 'bg-white bg-opacity-72 border border-white border-opacity-85'}`}
              onClick={() => setStockId('')}
            >
              <Text className={`block text-xs ${!stockId ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>全部股票</Text>
            </View>
            {stocks.map((s) => (
              <View
                key={s.id}
                className={`shrink-0 px-3 py-2 rounded-full text-xs ${stockId === s.id ? 'bg-primary-container' : 'bg-white bg-opacity-72 border border-white border-opacity-85'}`}
                onClick={() => setStockId(s.id === stockId ? '' : s.id)}
              >
                <Text className={`block text-xs ${stockId === s.id ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
                  {s.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 列表 */}
      <View className="px-4 space-y-3">
        {notes.length === 0 ? (
          <View className="rounded-2xl p-12 bg-white bg-opacity-72 border border-white border-opacity-85 flex flex-col items-center">
            <Text className="block text-base font-semibold text-on-surface">
              {typeFilter === 'doc' ? '还没有文档' : '还没有观点'}
            </Text>
            <Text className="block text-sm text-on-surface-variant mt-2">
              {typeFilter === 'doc' ? '上传你的第一份研究文档' : '记录你对市场的第一份见解'}
            </Text>
            <View
              className="mt-4 px-5 py-3 rounded-full bg-primary flex items-center gap-2"
              onClick={() => Taro.navigateTo({ url: '/pages/note-edit/index' })}
            >
              <PenLine size={16} color="#ffffff" />
              <Text className="block text-sm font-semibold text-white">立即{typeFilter === 'doc' ? '上传' : '记录'}</Text>
            </View>
          </View>
        ) : (
          notes.map((n) => {
            const isDoc = n.type === 'doc'
            return (
              <View
                key={n.id}
                className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.99] transition-transform"
                onClick={() => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${n.id}` })}
              >
                <View className="flex items-center gap-2 mb-2">
                  {/* 类型徽章 */}
                  <View className="inline-flex items-center px-2 py-1 rounded-full" style={{ background: isDoc ? typeMeta.doc.bg : 'rgba(91, 94, 114, 0.10)' }}>
                    {isDoc ? (
                      <View className="flex items-center gap-1">
                        <FileText size={10} color={typeMeta.doc.color} />
                        <Text className="block text-[10px] font-semibold" style={{ color: typeMeta.doc.color }}>文档</Text>
                      </View>
                    ) : (
                      <View className="px-2 py-1 rounded-full" style={{ background: (directionMeta as any)[n.direction || 'neutral'].bg }}>
                        <Text className="block text-[10px] font-semibold" style={{ color: (directionMeta as any)[n.direction || 'neutral'].text }}>
                          {directionMeta[n.direction as 'bull' | 'bear' | 'neutral']?.label ?? '中性'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="block text-xs font-medium text-on-surface truncate">{n.stock_name}</Text>
                  <Text className="block text-[10px] text-on-surface-variant text-opacity-70 tabular-nums">{n.stock_code}</Text>
                </View>
                <Text className="block text-base font-semibold text-on-surface leading-snug">
                  {n.title}
                </Text>
                {!isDoc && n.content ? (
                  <Text
                    className="block text-sm text-on-surface-variant mt-2 leading-[1.5]"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {n.content}
                  </Text>
                ) : null}
                {isDoc && n.content ? (
                  <View className="mt-2 text-sm text-on-surface-variant leading-[1.5]" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {/* 去掉 HTML 标签显示纯文本预览 */}
                    {/* @ts-ignore */}
                    <rich-text nodes={n.content.replace(/<[^>]+>/g, '').slice(0, 200)} />
                  </View>
                ) : null}
                {!isDoc && n.images && n.images.length > 0 ? (
                  <View className="mt-3 flex gap-2">
                    {n.images.slice(0, 3).map((img, i) => (
                      <Image key={i} src={img} mode="aspectFill" className="w-16 h-16 rounded-lg" />
                    ))}
                    {n.images.length > 3 ? (
                      <View className="w-16 h-16 rounded-lg bg-surface-container flex items-center justify-center">
                        <Text className="block text-xs text-on-surface-variant">+{n.images.length - 3}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <View className="mt-3 flex items-center justify-between">
                  <View className="flex items-center gap-2">
                    {n.tags && n.tags.length > 0 ? n.tags.slice(0, 2).map((t) => (
                      <View key={t} className="px-2 py-1 rounded bg-surface-container">
                        <Text className="block text-[10px] text-on-surface-variant">#{t}</Text>
                      </View>
                    )) : null}
                  </View>
                  <Text className="block text-[11px] text-on-surface-variant">{timeAgo(n.created_at)}</Text>
                </View>
                {!isDoc && (n.entry_price || n.target_price || n.stop_loss) ? (
                  <View className="mt-3 flex items-center gap-3 pt-3 border-t border-outline-variant border-opacity-30">
                    {n.entry_price ? (
                      <View>
                        <Text className="block text-[10px] text-on-surface-variant">入场</Text>
                        <Text className="block text-xs font-semibold text-on-surface tabular-nums">{Number(n.entry_price).toFixed(2)}</Text>
                      </View>
                    ) : null}
                    {n.target_price ? (
                      <View>
                        <Text className="block text-[10px] text-on-surface-variant">目标</Text>
                        <Text className="block text-xs font-semibold text-success tabular-nums">{Number(n.target_price).toFixed(2)}</Text>
                      </View>
                    ) : null}
                    {n.stop_loss ? (
                      <View>
                        <Text className="block text-[10px] text-on-surface-variant">止损</Text>
                        <Text className="block text-xs font-semibold text-error tabular-nums">{Number(n.stop_loss).toFixed(2)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )
          })
        )}
      </View>

      {/* FAB */}
      <View
        className="fixed right-5 z-30 w-14 h-14 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))', boxShadow: '0 0 0 1px rgba(109,77,255,0.30), 0 8px 24px rgba(109,77,255,0.18)' }}
        onClick={() => Taro.navigateTo({ url: '/pages/note-edit/index' })}
      >
        <PenLine size={26} color="#ffffff" />
      </View>
    </View>
  )
}
