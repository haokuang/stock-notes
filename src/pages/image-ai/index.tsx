import { View, Text, ScrollView, Image } from '@tarojs/components'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { Image as ImageIcon, Sparkles, Save } from 'lucide-react-taro'

interface AiResult {
  summary: string
  key_points: string[]
  sentiment: 'bull' | 'bear' | 'neutral'
  confidence: number
  image_url: string
  mock: boolean
}

export default function ImageAiPage() {
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('分析这张K线图：当前趋势、关键支撑/阻力位、操作建议')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AiResult | null>(null)

  useLoad(() => {
    const cached = Taro.getStorageSync('image-ai-result')
    if (cached) setResult(cached)
  })

  const onPick = async () => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const path = (res.tempFilePaths ?? [])[0]
      if (!path) return
      Taro.showLoading({ title: '上传中...' })
      try {
        const up = await Network.uploadFile({
          url: '/api/upload/image',
          filePath: path,
          name: 'file',
          formData: {},
        })
        const json = JSON.parse(up.data)
        if (up.statusCode !== 200 || !json?.data?.url) {
          throw new Error(json?.message ?? '上传失败')
        }
        const url = json.data.url
        setImageUrl(url)
        Taro.hideLoading()
        Taro.showToast({ title: '已上传', icon: 'success' })
      } catch (err) {
        Taro.hideLoading()
        console.error('[image-ai] upload failed', err)
        Taro.showToast({ title: '图片上传失败', icon: 'none' })
      }
    } catch (e) {
      console.error('[image-ai] pick failed', e)
    }
  }

  const onAnalyze = async () => {
    if (!imageUrl) {
      Taro.showToast({ title: '请先上传截图', icon: 'none' })
      return
    }
    if (!prompt.trim()) {
      Taro.showToast({ title: '请输入提示词', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const res = await Network.request<{ data: AiResult }>({
        url: '/api/ai/image-understand',
        method: 'POST',
        data: { imageUrl, prompt: prompt.trim() },
      })
      console.log('[image-ai] result', res.data)
      const data = res.data?.data
      if (!data) throw new Error('AI 返回为空')
      setResult(data ?? null)
      Taro.setStorageSync('image-ai-result', data)
    } catch (e) {
      console.error('[image-ai] failed', e)
      Taro.showToast({ title: 'AI 服务暂不可用', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const onSave = () => {
    if (!result) return
    Taro.showToast({ title: '已复制到剪贴板', icon: 'success' })
    const text = `【${result.sentiment === 'bull' ? '看多' : result.sentiment === 'bear' ? '看空' : '中性'}·置信度 ${Math.round(result.confidence * 100)}%】\n${result.summary}\n关键点：\n${(result.key_points ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    Taro.setClipboardData({ data: text })
  }

  const sentimentColor = result?.sentiment === 'bull' ? '#D11A4A' : result?.sentiment === 'bear' ? '#0F8C66' : '#B45309'  // 红涨绿跌
  const sentimentLabel = result?.sentiment === 'bull' ? '看多' : result?.sentiment === 'bear' ? '看空' : '中性'

  return (
    <View className="w-full min-h-full pb-[calc(2rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      <PageHeader title="AI 单图解读" onBack={() => Taro.navigateBack()} />

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 上传区 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">截图</Text>
            {imageUrl ? (
              <View className="relative w-full aspect-video rounded-xl overflow-hidden bg-surface-container">
                <Image src={imageUrl} mode="aspectFit" className="w-full h-full" />
                <View
                  className="absolute top-2 right-2 px-3 py-1 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                  onClick={onPick}
                >
                  <Text className="block text-[11px] font-semibold text-white">更换</Text>
                </View>
              </View>
            ) : (
              <View
                className="w-full aspect-video rounded-xl flex flex-col items-center justify-center"
                style={{ background: 'rgba(109, 77, 255, 0.04)', border: '2px dashed rgba(109, 77, 255, 0.30)' }}
                onClick={onPick}
              >
                <ImageIcon size={28} color="#6D4DFF" />
                <Text className="block text-sm text-on-surface mt-2 font-semibold">点击上传截图</Text>
                <Text className="block text-[11px] text-on-surface-variant mt-1">支持 K 线、研报、新闻图（&lt;10MB）</Text>
              </View>
            )}
          </View>
        </View>

        {/* 提示词 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">分析提示</Text>
            <View className="bg-surface-container rounded-xl px-3 py-3">
              <Input
                className="w-full bg-transparent"
                style={{ fontSize: '13px', color: '#161826' }}
                placeholder="告诉 AI 你想分析什么"
                placeholderTextColor="#9498AC"
                value={prompt}
                onInput={(e) => setPrompt(e.detail.value)}
                maxlength={200}
              />
            </View>
            <View
              className="mt-3 w-full py-3 rounded-xl flex items-center justify-center gap-2"
              style={{ background: loading ? 'rgba(109, 77, 255, 0.4)' : '#6D4DFF' }}
              onClick={onAnalyze}
            >
              <Sparkles size={16} color="#ffffff" />
              <Text className="block text-sm font-semibold text-white">
                {loading ? 'AI 分析中...' : '开始 AI 解读'}
              </Text>
            </View>
          </View>
        </View>

        {/* 解读结果 */}
        {result && (
          <View className="px-4 pt-3">
            <View
              className="rounded-2xl p-4 border"
              style={{ background: 'rgba(255, 255, 255, 0.88)', borderColor: 'rgba(109, 77, 255, 0.30)' }}
            >
              <View className="flex items-center justify-between mb-3">
                <View className="flex items-center gap-2">
                  <View className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(109, 77, 255, 0.10)' }}>
                    <Sparkles size={16} color="#6D4DFF" />
                  </View>
                  <Text className="block text-sm font-semibold text-on-surface">AI 解读结果</Text>
                </View>
                <View
                  className="px-3 py-1 rounded-full"
                  style={{ background: `${sentimentColor}1A` }}
                >
                  <Text className="block text-[11px] font-semibold" style={{ color: sentimentColor }}>
                    {sentimentLabel} · {Math.round((result.confidence ?? 0) * 100)}%
                  </Text>
                </View>
              </View>

              <View className="bg-surface-container rounded-xl p-3 mb-3">
                <Text className="block text-sm text-on-surface leading-relaxed" style={{ wordBreak: 'break-word' }}>
                  {result.summary}
                </Text>
              </View>

              {result.key_points && result.key_points.length > 0 && (
                <View>
                  <Text className="block text-xs text-on-surface-variant mb-2">关键要点</Text>
                  <View className="space-y-2">
                    {result.key_points.map((p, i) => (
                      <View key={i} className="flex items-start gap-2">
                        <View className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-1" style={{ background: 'rgba(109, 77, 255, 0.10)' }}>
                          <Text className="block text-[10px] font-bold text-primary">{i + 1}</Text>
                        </View>
                        <Text className="flex-1 block text-sm text-on-surface leading-relaxed" style={{ wordBreak: 'break-word' }}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {result.mock && (
                <View className="mt-3 px-3 py-2 rounded-md flex items-center gap-2" style={{ background: 'rgba(180, 83, 9, 0.10)' }}>
                  <Text className="block text-[10px] font-semibold" style={{ color: '#B45309' }}>
                    当前为占位结果，未配置 LLM Token
                  </Text>
                </View>
              )}

              <View
                className="mt-3 w-full py-3 rounded-xl flex items-center justify-center gap-2"
                style={{ background: '#6D4DFF' }}
                onClick={onSave}
              >
                <Save size={14} color="#ffffff" />
                <Text className="block text-xs font-semibold text-white">复制为文字笔记</Text>
              </View>
            </View>
          </View>
        )}

        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
