import { View, Text } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Search, CirclePlus, Check } from 'lucide-react-taro'

interface SearchResult {
  code: string
  name: string
  market: string
  industry: string
}

const POPULAR: SearchResult[] = [
  { code: '600519', name: '贵州茅台', market: '上交所', industry: '白酒' },
  { code: '300750', name: '宁德时代', market: '深交所', industry: '新能源' },
  { code: '000858', name: '五粮液', market: '深交所', industry: '白酒' },
  { code: '601318', name: '中国平安', market: '上交所', industry: '保险' },
  { code: '000001', name: '平安银行', market: '深交所', industry: '银行' },
  { code: '600036', name: '招商银行', market: '上交所', industry: '银行' },
]

export default function StockAddPage() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>(POPULAR)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const onSearch = (val: string) => {
    setKeyword(val)
    if (!val.trim()) {
      setResults(POPULAR)
      return
    }
    const k = val.trim().toLowerCase()
    setResults(POPULAR.filter((s) => s.code.includes(k) || s.name.includes(val)))
  }

  const onAdd = async (item: SearchResult) => {
    if (saving) return
    setSaving(true)
    setAdding(item.code)
    try {
      await Network.request({
        url: '/api/stocks',
        method: 'POST',
        data: {
          code: item.code,
          name: item.name,
          market: item.market,
          industry: item.industry,
        },
      })
      setAdded(new Set([...added, item.code]))
      Taro.showToast({ title: '已添加', icon: 'success' })
    } catch (e: any) {
      console.error('[stock-add] failed', e)
      const msg = e?.data?.msg ?? '添加失败'
      Taro.showToast({ title: msg, icon: 'none' })
    } finally {
      setAdding(null)
      setSaving(false)
    }
  }

  const onCustomAdd = async () => {
    if (!keyword.trim()) {
      Taro.showToast({ title: '请输入股票代码或名称', icon: 'none' })
      return
    }
    await onAdd({ code: keyword.trim(), name: keyword.trim(), market: '深交所', industry: '自选' })
    setKeyword('')
  }

  return (
    <View className="w-full min-h-full pb-[calc(2rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* 搜索框 */}
      <View className="px-4 pt-3">
        <View className="rounded-2xl p-3 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-2">
          <Search size={18} color="#5B5E72" />
          <Input
            className="flex-1 bg-transparent"
            style={{ fontSize: '14px', color: '#161826' }}
            placeholder="搜索股票代码或名称"
            placeholderTextColor="#9498AC"
            value={keyword}
            onInput={(e) => onSearch(e.detail.value)}
            confirmType="search"
            onConfirm={onCustomAdd}
          />
          {keyword && (
            <View
              className="px-3 py-2 rounded-lg flex items-center gap-1 bg-primary"
              onClick={onCustomAdd}
            >
              <CirclePlus size={12} color="#ffffff" />
              <Text className="block text-xs font-semibold text-white">添加</Text>
            </View>
          )}
        </View>
      </View>

      {/* 提示 */}
      <View className="px-4 pt-3">
        <View className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(109, 77, 255, 0.08)' }}>
          <Text className="block text-xs text-primary">{keyword ? '搜索结果' : '热门自选'}（{results.length}）</Text>
        </View>
      </View>

      {/* 列表 */}
      <View className="px-4 pt-2">
        <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
          {results.length === 0 ? (
            <View className="p-6">
              <Text className="block text-sm text-on-surface-variant text-center">没有匹配的股票</Text>
            </View>
          ) : (
            results.map((s, i) => {
              const isAdded = added.has(s.code)
              return (
                <View
                  key={s.code}
                  className="flex items-center gap-3 px-4 py-4"
                  style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                >
                  <View className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary-container">
                    <Text className="block text-base font-bold text-primary">{s.name.slice(0, 1)}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="block text-sm font-semibold text-on-surface truncate">{s.name}</Text>
                    <Text className="block text-xs text-on-surface-variant mt-1 tabular-nums">{s.code} · {s.industry}</Text>
                  </View>
                  {isAdded ? (
                    <View className="px-3 py-1 rounded-md flex items-center gap-1" style={{ background: 'rgba(15, 140, 102, 0.10)' }}>
                      <Check size={12} color="#0F8C66" />
                      <Text className="block text-xs font-semibold" style={{ color: '#0F8C66' }}>已添加</Text>
                    </View>
                  ) : (
                    <View
                      className="px-3 py-2 rounded-md"
                      style={{ background: '#6D4DFF' }}
                      onClick={() => onAdd(s)}
                    >
                      <Text className="block text-xs font-semibold text-white">
                        {adding === s.code ? '添加中' : '添加'}
                      </Text>
                    </View>
                  )}
                </View>
              )
            })
          )}
        </View>
      </View>

      <View className="px-4 pt-4">
        <Text className="block text-[11px] text-on-surface-variant text-center leading-relaxed">
          暂未对接实时行情，添加后可在「我的」管理{'\n'}后续将接入 tushare 自动同步
        </Text>
      </View>
    </View>
  )
}
