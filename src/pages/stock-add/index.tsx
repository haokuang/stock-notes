import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { Check, CirclePlus, Search } from 'lucide-react-taro'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Network } from '@/network'

interface SearchResult {
  code: string
  tsCode: string
  name: string
  market: string
  industry: string
  exchange: 'SSE' | 'SZSE' | 'BSE'
}

interface ExistingStock {
  code: string
}

const EXCHANGE_LABELS: Record<SearchResult['exchange'], string> = {
  SSE: '上交所',
  SZSE: '深交所',
  BSE: '北交所',
}

export default function StockAddPage() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const searchSequence = useRef(0)

  useLoad(async () => {
    try {
      const res = await Network.request<{ data: ExistingStock[] }>({ url: '/api/stocks' })
      setAdded(new Set((res.data?.data ?? []).map((stock) => stock.code)))
    } catch (error) {
      console.error('[stock-add] load existing stocks failed', error)
    }
  })

  const searchStocks = async (value: string) => {
    const normalized = value.trim()
    const sequence = ++searchSequence.current
    if (!normalized) {
      setResults([])
      setSearchError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setSearchError('')
    try {
      const res = await Network.request<{ data: SearchResult[] }>({
        url: `/api/stocks/search?keyword=${encodeURIComponent(normalized)}&limit=20`,
      })
      if (sequence !== searchSequence.current) return
      setResults(res.data?.data ?? [])
    } catch (error) {
      if (sequence !== searchSequence.current) return
      console.error('[stock-add] search failed', error)
      setResults([])
      setSearchError('股票搜索暂不可用，请稍后重试')
    } finally {
      if (sequence === searchSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchStocks(keyword)
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const onAdd = async (item: SearchResult) => {
    if (adding || added.has(item.code)) return
    setAdding(item.code)
    try {
      await Network.request({
        url: '/api/stocks',
        method: 'POST',
        data: { code: item.code },
      })
      setAdded((current) => new Set([...current, item.code]))
      Taro.showToast({ title: '已添加', icon: 'success' })
    } catch (error: any) {
      console.error('[stock-add] add failed', error)
      const message = error?.data?.message ?? error?.data?.msg ?? '添加失败'
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setAdding(null)
    }
  }

  return (
    <View className="min-h-full w-full bg-surface pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <View className="px-4 pt-3">
        <View className="flex items-center gap-2">
          <Search size={20} color="#5B5E72" />
          <Input
            className="flex-1"
            placeholder="输入股票代码或名称"
            value={keyword}
            onInput={(event) => setKeyword(event.detail.value)}
            confirmType="search"
            onConfirm={() => searchStocks(keyword)}
          />
        </View>
        <Text className="mt-2 block text-xs text-on-surface-variant">
          仅支持沪深北已上市的 A 股普通股票
        </Text>
      </View>

      <View className="px-4 pt-4">
        {!keyword.trim() ? (
          <Card>
            <CardContent className="p-6">
              <Text className="block text-center text-sm text-on-surface-variant">
                输入 6 位股票代码或中文名称开始搜索
              </Text>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="p-6">
              <Text className="block text-center text-sm text-on-surface-variant">正在搜索...</Text>
            </CardContent>
          </Card>
        ) : searchError ? (
          <Card>
            <CardContent className="p-6">
              <Text className="block text-center text-sm text-error">{searchError}</Text>
            </CardContent>
          </Card>
        ) : results.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <Text className="block text-center text-sm text-on-surface-variant">
                没有找到符合条件的 A 股普通股票
              </Text>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {results.map((stock, index) => {
                const isAdded = added.has(stock.code)
                return (
                  <View
                    key={stock.tsCode}
                    className="flex items-center gap-3 px-4 py-4"
                    style={{ borderTop: index > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                  >
                    <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
                      <Text className="block text-base font-bold text-primary">{stock.name.slice(0, 1)}</Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="block truncate text-sm font-semibold text-on-surface">{stock.name}</Text>
                      <Text className="mt-1 block text-xs text-on-surface-variant">
                        {stock.code} · {EXCHANGE_LABELS[stock.exchange]}
                        {stock.industry ? ` · ${stock.industry}` : ''}
                      </Text>
                    </View>
                    <Button
                      size="sm"
                      variant={isAdded ? 'secondary' : 'default'}
                      disabled={isAdded || adding === stock.code}
                      onClick={() => onAdd(stock)}
                    >
                      {isAdded ? <Check size={14} color="#0F8C66" /> : <CirclePlus size={14} color="#ffffff" />}
                      <Text className="block text-xs font-semibold">
                        {isAdded ? '已添加' : adding === stock.code ? '添加中' : '添加'}
                      </Text>
                    </Button>
                  </View>
                )
              })}
            </CardContent>
          </Card>
        )}
      </View>
    </View>
  )
}
