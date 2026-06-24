import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Calendar } from 'lucide-react-taro'
import { PageHeader } from '@/components/ui/page-header'
import { HeatmapResponse, normalizeHeatmap } from '../prelaunch-navigation'

interface DayBucket {
  date: string
  count: number
  notes: { id: string; title: string; stock_name: string; direction: string }[]
}

export default function HeatmapDetailPage() {
  const [buckets, setBuckets] = useState<DayBucket[]>([])
  const [total, setTotal] = useState(0)
  const [activeDays, setActiveDays] = useState(0)
  const [loading, setLoading] = useState(false)
  const [days, setDays] = useState(180)

  const load = async (d: number) => {
    setLoading(true)
    try {
      const res = await Network.request<HeatmapResponse>({
        url: `/api/notes/heatmap?days=${d}`,
      })
      console.log('[heatmap]', res.data)
      const normalized = normalizeHeatmap(res.data)
      setBuckets(normalized.buckets)
      setTotal(normalized.total)
      setActiveDays(normalized.activeDays)
    } catch (e) {
      console.error('[heatmap] load failed', e)
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    load(days)
  })

  usePullDownRefresh(async () => {
    await load(days)
    Taro.stopPullDownRefresh()
  })

  const goDay = (b: DayBucket) => {
    if (b.count === 0) return
    Taro.navigateTo({ url: `/pages/library/index?date_from=${b.date}&date_to=${b.date}` })
  }

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      <PageHeader title="记录热力图" onBack={() => Taro.navigateBack()} />

      {/* 统计卡片 */}
      <View className="px-4 pt-3">
        <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
          <View className="flex items-center justify-between">
            <View className="flex flex-col">
              <Text className="block text-xs text-on-surface-variant">总观点</Text>
              <Text className="block text-2xl font-bold text-on-surface tabular-nums mt-1">{total}</Text>
            </View>
            <View className="flex flex-col items-center">
              <Text className="block text-xs text-on-surface-variant">活跃天数</Text>
              <Text className="block text-2xl font-bold text-primary tabular-nums mt-1">{activeDays}</Text>
            </View>
            <View className="flex flex-col items-end">
              <Text className="block text-xs text-on-surface-variant">日均</Text>
              <Text className="block text-2xl font-bold text-on-surface tabular-nums mt-1">
                {activeDays > 0 ? (total / activeDays).toFixed(1) : '0'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 范围切换 */}
      <View className="px-4 pt-3">
        <View className="flex items-center gap-2">
          {[90, 180, 365].map((d) => (
            <View
              key={d}
              className="px-3 py-2 rounded-full"
              style={{
                background: days === d ? '#6D4DFF' : '#E6E8F0',
              }}
              onClick={() => { setDays(d); load(d) }}
            >
              <Text className="block text-xs font-semibold" style={{ color: days === d ? '#ffffff' : '#5B5E72' }}>
                {d === 90 ? '近 3 月' : d === 180 ? '近半年' : '近一年'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 列表 */}
        <View className="px-4 pt-3">
          <Text className="block text-sm font-semibold text-on-surface mb-3">按日详情</Text>
          {loading ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">加载中...</Text>
            </View>
          ) : buckets.length === 0 ? (
            <View className="rounded-2xl p-6 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm text-on-surface-variant text-center">最近没有观点记录</Text>
            </View>
          ) : (
            <View className="rounded-2xl bg-white bg-opacity-72 border border-white border-opacity-85 overflow-hidden">
              {buckets.filter((b) => b.count > 0).map((b, i) => (
                <View
                  key={b.date}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i > 0 ? '1px solid rgba(221, 223, 233, 0.5)' : 'none' }}
                  onClick={() => goDay(b)}
                >
                  <View className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(109, 77, 255, 0.10)' }}>
                    <Calendar size={18} color="#6D4DFF" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="block text-sm font-semibold text-on-surface tabular-nums">{b.date}</Text>
                    <Text className="block text-[11px] text-on-surface-variant mt-1">点击查看当日观点</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full" style={{ background: 'rgba(109, 77, 255, 0.10)' }}>
                    <Text className="block text-xs font-bold text-primary tabular-nums">{b.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
