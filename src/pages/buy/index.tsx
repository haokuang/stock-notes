import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert } from '@/components/ui/alert'
import { TriangleAlert } from 'lucide-react-taro'

interface BuyResponse {
  stock_id: string
  status: 'holding'
  entry_price: number
  loss_rate: number
  stop_loss_price: number
  entered_at: string
  buy_note_id: string | null
}

export default function BuyPage() {
  const [stockId, setStockId] = useState<string>('')
  const [stockName, setStockName] = useState<string>('')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [entryPrice, setEntryPrice] = useState<string>('')
  const [lossRate, setLossRate] = useState<string>('10')
  const [buyReason, setBuyReason] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLoad((options) => {
    const id = options.stock_id
    if (!id) {
      setError('缺少 stock_id 参数')
      return
    }
    setStockId(id)
    // 拉一次股票信息,显示当前价作为参考
    Network.request<{ data: { id: string; name: string; current_price: string | null } }>({
      url: `/api/stocks/${id}`,
    })
      .then((res) => {
        const data = res.data?.data
        if (data) {
          setStockName(data.name)
          if (data.current_price) {
            const p = Number(data.current_price)
            setCurrentPrice(p)
            setEntryPrice(data.current_price)
          }
        }
      })
      .catch((e) => setError(e?.data?.message ?? '加载股票信息失败'))
  })

  const stopLossPreview = () => {
    const e = Number(entryPrice)
    const r = Number(lossRate)
    if (!e || !r) return null
    return ((e * (100 - r)) / 100).toFixed(2)
  }

  const submit = async () => {
    if (!entryPrice || !lossRate || buyReason.length < 10) {
      setError('请填写完整:买入价、亏损率(0-100)、买入理由(至少 10 字)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await Network.request<{ data: BuyResponse }>({
        url: `/api/stocks/${stockId}/buy`,
        method: 'POST',
        data: {
          entryPrice: Number(entryPrice),
          lossRate: Number(lossRate),
          buyReason: buyReason.trim(),
        },
      })
      Taro.showToast({ title: '买入成功', icon: 'success' })
      setTimeout(() => Taro.redirectTo({ url: `/pages/stock/index?stock_id=${stockId}` }), 600)
    } catch (e: any) {
      setError(e?.data?.message ?? e?.errMsg ?? '买入失败')
    } finally {
      setLoading(false)
    }
  }

  const stopLoss = stopLossPreview()

  return (
    <View
      className="w-full min-h-screen px-4 pt-3 pb-8"
      style={{
        background:
          'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(109, 77, 255, 0.12), transparent 60%), #EEF0F6',
      }}
    >
      <View className="mb-4">
        <Text className="block text-2xl font-bold text-on-surface">确认买入</Text>
        {stockName ? (
          <Text className="block text-sm text-on-surface-variant mt-1">
            {stockName}
            {currentPrice ? ` · 当前价 ¥${currentPrice}` : ''}
          </Text>
        ) : null}
      </View>

      <View
        className="rounded-2xl p-5 bg-white bg-opacity-72 border border-white border-opacity-85 space-y-4"
        style={{ boxShadow: '0 1px 2px rgba(20,18,60,0.04), 0 6px 24px rgba(20,18,60,0.06)' }}
      >
        <View>
          <Text className="block text-xs font-medium text-on-surface-variant mb-2">
            买入价 (¥) <Text className="text-error">*</Text>
          </Text>
          <Input
            type="digit"
            value={entryPrice}
            onInput={(e: any) => setEntryPrice(e.detail.value)}
            placeholder="例如 35.50"
            className="h-12 rounded-xl bg-surface-container px-4 py-3"
            disabled={loading}
          />
        </View>

        <View>
          <Text className="block text-xs font-medium text-on-surface-variant mb-2">
            亏损率上限 (%,0-100) <Text className="text-error">*</Text>
          </Text>
          <Input
            type="number"
            value={lossRate}
            onInput={(e: any) => setLossRate(e.detail.value)}
            placeholder="例如 10 表示亏损 10% 止损"
            className="h-12 rounded-xl bg-surface-container px-4 py-3"
            disabled={loading}
          />
          <Text className="block text-[11px] text-on-surface-variant mt-1">
            触及该比例将触发止损提醒
          </Text>
        </View>

        <View>
          <Text className="block text-xs font-medium text-on-surface-variant mb-2">
            买入理由 <Text className="text-error">*</Text>
          </Text>
          <Textarea
            value={buyReason}
            onInput={(e: any) => setBuyReason(e.detail.value)}
            placeholder="为什么买入?至少 10 字"
            placeholderClass="text-muted-foreground"
            maxlength={500}
            className="w-full px-3 py-3 rounded-md bg-surface-container text-sm text-on-surface border border-input"
            style={{ minHeight: '120px' }}
            disabled={loading}
          />
          <Text className="block text-[11px] text-on-surface-variant mt-1 text-right">
            {buyReason.length} / 500
          </Text>
        </View>

        {stopLoss ? (
          <Alert className="rounded-xl border-red-200 bg-red-50 p-4">
            <View className="flex items-start gap-3">
              <View className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error">
                <TriangleAlert size={18} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="block text-xs font-medium text-on-surface-variant">预计止损价</Text>
                <Text className="mt-1 block text-xl font-bold text-error">¥{stopLoss}</Text>
                <Text className="mt-1 block text-xs leading-relaxed text-on-surface-variant">
                  较买入价下跌 {lossRate}% 时提醒，并建议重新评估
                </Text>
              </View>
            </View>
          </Alert>
        ) : null}

        {error ? (
          <View className="rounded-lg p-3 bg-error bg-opacity-10">
            <Text className="block text-xs text-error">{error}</Text>
          </View>
        ) : null}

        <Button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          确认买入
        </Button>
      </View>
    </View>
  )
}
