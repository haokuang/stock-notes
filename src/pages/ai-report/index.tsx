import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { ArrowLeft, Sparkles, Share2 } from 'lucide-react-taro'

export default function AiReportPage() {
  const [stockName, setStockName] = useState('')
  const [report, setReport] = useState('')

  useLoad((opts) => {
    setStockName(opts?.stock_name ? decodeURIComponent(opts.stock_name) : 'AI 报告')
    setReport(opts?.report ? decodeURIComponent(opts.report) : '')
  })

  const onShare = () => {
    Taro.setClipboardData({ data: report })
    Taro.showToast({ title: '已复制到剪贴板', icon: 'success' })
  }

  // 简单把报告分段渲染
  const sections = report
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      <View
        className="flex items-center justify-between px-4 pb-2 bg-background sticky top-0 z-40"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#161826" />
        </View>
        <Text className="block text-base font-semibold text-on-surface">AI 投研报告</Text>
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onShare}>
          <Share2 size={18} color="#5B5E72" />
        </View>
      </View>

      {/* Hero */}
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
          <Text className="block text-xl font-bold text-white leading-tight">跨观点复盘报告</Text>
          <Text className="block text-xs text-white text-opacity-80 mt-2">基于历史观点自动汇总 · {new Date().toLocaleDateString('zh-CN')}</Text>
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
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
        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
