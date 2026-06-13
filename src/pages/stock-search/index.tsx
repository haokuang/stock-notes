import { View, Text } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Search, X } from 'lucide-react-taro'

interface Stock {
  id: string
  code: string
  name: string
  industry: string | null
  notes_count: number
}

interface Note {
  id: string
  title: string
  content: string
  direction: string
  stock_name: string
  created_at: string
}

export default function StockSearchPage() {
  const [keyword, setKeyword] = useState('')
  const [mode, setMode] = useState<'stock' | 'note'>('stock')
  const [stocks, setStocks] = useState<Stock[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)

  useLoad(() => {
    onSearch('')
  })

  const onSearch = async (kw: string) => {
    setLoading(true)
    try {
      if (mode === 'stock') {
        const res = await Network.request<{ data: Stock[] }>({ url: `/api/stocks?keyword=${encodeURIComponent(kw)}` })
        setStocks(res.data?.data ?? [])
      } else {
        const res = await Network.request<{ data: Note[] }>({ url: `/api/notes?keyword=${encodeURIComponent(kw)}&limit=50` })
        setNotes(res.data?.data ?? [])
      }
    } catch (e) {
      console.error('[search] failed', e)
    } finally {
      setLoading(false)
    }
  }

  const onChangeMode = (m: 'stock' | 'note') => {
    setMode(m)
    onSearch(keyword)
  }

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      {/* 搜索框 */}
      <View className="px-4 pt-3">
        <View className="rounded-2xl p-3 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-2">
          <Search size={18} color="#5B5E72" />
          <Input
            className="flex-1 bg-transparent"
            style={{ fontSize: '14px', color: '#161826' }}
            placeholder={mode === 'stock' ? '搜索股票' : '搜索观点'}
            placeholderTextColor="#9498AC"
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={() => onSearch(keyword)}
            confirmType="search"
          />
          {keyword && (
            <View className="w-7 h-7 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => { setKeyword(''); onSearch('') }}>
              <X size={16} color="#5B5E72" />
            </View>
          )}
        </View>
      </View>

      {/* 模式切换 */}
      <View className="px-4 pt-3">
        <View className="flex items-center gap-2">
          {[
            { v: 'stock' as const, label: '股票' },
            { v: 'note' as const, label: '观点' },
          ].map((m) => (
            <View
              key={m.v}
              className="px-3 py-2 rounded-full"
              style={{ background: mode === m.v ? '#6D4DFF' : '#E6E8F0' }}
              onClick={() => onChangeMode(m.v)}
            >
              <Text className="block text-xs font-semibold" style={{ color: mode === m.v ? '#ffffff' : '#5B5E72' }}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 结果 */}
      <View className="px-4 pt-3">
        {loading ? (
          <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-sm text-on-surface-variant text-center">搜索中...</Text>
          </View>
        ) : mode === 'stock' ? (
          stocks.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">没有匹配的股票</Text>
            </View>
          ) : (
            <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
              {stocks.map((s, i) => (
                <View
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-4"
                  style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                  onClick={() => Taro.navigateTo({ url: `/pages/stock/index?stock_id=${s.id}` })}
                >
                  <View className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary-container">
                    <Text className="block text-base font-bold text-primary">{s.name.slice(0, 1)}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="block text-sm font-semibold text-on-surface truncate">{s.name}</Text>
                    <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">
                      {s.code}{s.industry ? ` · ${s.industry}` : ''} · {s.notes_count ?? 0} 条观点
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : notes.length === 0 ? (
          <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-sm text-on-surface-variant text-center">没有匹配的观点</Text>
          </View>
        ) : (
          <View className="space-y-3">
            {notes.map((n) => (
              <View
                key={n.id}
                className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 active:scale-[0.99] transition-transform"
                onClick={() => Taro.navigateTo({ url: `/pages/note-detail/index?note_id=${n.id}` })}
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
                  <Text className="block text-[11px] text-primary font-semibold">{n.stock_name}</Text>
                </View>
                <Text className="block text-sm font-semibold text-on-surface leading-tight">{n.title}</Text>
                <Text className="block text-xs text-on-surface-variant mt-2 leading-relaxed" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {n.content}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}
