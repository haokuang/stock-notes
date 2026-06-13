import { View, Text, ScrollView, Image } from '@tarojs/components'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { ArrowLeft, X, Image as ImageIcon, Sparkles } from 'lucide-react-taro'

const DIRECTIONS: { value: 'bull' | 'bear' | 'neutral'; label: string; color: string; bg: string }[] = [
  { value: 'bull', label: '看多', color: '#0F8C66', bg: 'rgba(15, 140, 102, 0.10)' },
  { value: 'neutral', label: '中性', color: '#B45309', bg: 'rgba(180, 83, 9, 0.10)' },
  { value: 'bear', label: '看空', color: '#D11A4A', bg: 'rgba(209, 26, 74, 0.10)' },
]

export default function NoteEditPage() {
  const [stockId, setStockId] = useState('')
  const [stockName, setStockName] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [direction, setDirection] = useState<'bull' | 'bear' | 'neutral'>('bull')
  const [entryPrice, setEntryPrice] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [relatedEvent, setRelatedEvent] = useState('')
  const [source, setSource] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useLoad((opts) => {
    const sid = opts?.stock_id ?? ''
    setStockId(sid)
    setStockName(opts?.stock_name ? decodeURIComponent(opts.stock_name) : '')
  })

  const onAddTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (tags.includes(t)) {
      setTagInput('')
      return
    }
    setTags([...tags, t])
    setTagInput('')
  }

  const onRemoveTag = (t: string) => setTags(tags.filter((x) => x !== t))

  const onPickImages = async () => {
    try {
      const res = await Taro.chooseImage({
        count: 9 - images.length,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const paths = (res.tempFilePaths ?? []) as string[]
      if (paths.length === 0) return
      setUploading(true)
      const uploaded: string[] = []
      for (const path of paths) {
        try {
          const up = await Network.uploadFile({
            url: '/api/upload/fetch',
            filePath: path,
            name: 'file',
            formData: {},
          })
          const json = JSON.parse(up.data)
          const url = json?.data?.storedUrl
          if (url) uploaded.push(url)
          else uploaded.push(path)
        } catch (err) {
          console.error('[note-edit] upload failed', err)
          uploaded.push(path)
        }
      }
      setImages([...images, ...uploaded])
    } catch (e) {
      console.error('[note-edit] pick failed', e)
    } finally {
      setUploading(false)
    }
  }

  const onRemoveImage = (i: number) => setImages(images.filter((_, idx) => idx !== i))

  const onSave = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!stockId) {
      Taro.showToast({ title: '缺少股票信息', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      await Network.request({
        url: '/api/notes',
        method: 'POST',
        data: {
          stock_id: stockId,
          title: title.trim(),
          content: content.trim(),
          direction,
          entry_price: entryPrice ? parseFloat(entryPrice) : null,
          target_price: targetPrice ? parseFloat(targetPrice) : null,
          stop_loss: stopLoss ? parseFloat(stopLoss) : null,
          tags,
          images,
          related_event: relatedEvent.trim() || null,
          source: source.trim() || null,
        },
      })
      Taro.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (e) {
      console.error('[note-edit] save failed', e)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="w-full min-h-full pb-[calc(5rem+env(safe-area-inset-bottom))]" style={{ background: '#EEF0F6' }}>
      {/* Header */}
      <View
        className="flex items-center justify-between px-4 pb-2 bg-background sticky top-0 z-40"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#161826" />
        </View>
        <Text className="block text-base font-semibold text-on-surface">记录观点</Text>
        <View
          className="px-4 py-2 rounded-full"
          style={{ background: saving ? 'rgba(109, 77, 255, 0.4)' : '#6D4DFF' }}
          onClick={onSave}
        >
          <Text className="block text-xs font-semibold text-white">{saving ? '保存中' : '保存'}</Text>
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 股票关联 */}
        {stockName && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-3 bg-white bg-opacity-72 border border-white border-opacity-85 flex items-center gap-2">
              <View className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
                <Text className="block text-sm font-bold text-primary">{stockName.slice(0, 1)}</Text>
              </View>
              <Text className="block text-sm font-semibold text-on-surface">{stockName}</Text>
            </View>
          </View>
        )}

        {/* 标题 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">标题</Text>
            <View className="bg-surface-container rounded-xl px-4 py-3">
              <Input
                className="w-full bg-transparent"
                style={{ fontSize: '16px', fontWeight: 600, color: '#161826' }}
                placeholder="一句话总结你的观点..."
                
                value={title}
                onInput={(e) => setTitle(e.detail.value)}
                maxlength={50}
              />
            </View>
          </View>
        </View>

        {/* 方向选择 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">方向</Text>
            <View className="grid grid-cols-3 gap-2">
              {DIRECTIONS.map((d) => {
                const active = direction === d.value
                return (
                  <View
                    key={d.value}
                    className="py-3 rounded-xl flex items-center justify-center"
                    style={{
                      background: active ? d.bg : '#F8F9FD',
                      border: `1.5px solid ${active ? d.color : 'transparent'}`,
                    }}
                    onClick={() => setDirection(d.value)}
                  >
                    <Text className="block text-sm font-semibold" style={{ color: active ? d.color : '#5B5E72' }}>
                      {d.label}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        </View>

        {/* 价格点位 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">价格点位（可选）</Text>
            <View className="grid grid-cols-3 gap-2">
              {[
                { label: '入场', value: entryPrice, set: setEntryPrice, color: '#6D4DFF' },
                { label: '目标', value: targetPrice, set: setTargetPrice, color: '#0F8C66' },
                { label: '止损', value: stopLoss, set: setStopLoss, color: '#D11A4A' },
              ].map((p) => (
                <View key={p.label} className="bg-surface-container rounded-xl px-3 py-3">
                  <Text className="block text-[10px] mb-1" style={{ color: p.color }}>{p.label}</Text>
                  <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <Text className="text-base font-semibold mr-1" style={{ color: '#9498AC' }}>¥</Text>
                    <Input
                      style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: '#161826' }}
                      placeholder="—"
                      
                      type="digit"
                      value={p.value}
                      onInput={(e) => p.set(e.detail.value)}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 详细观点 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <View className="flex items-center justify-between mb-2">
              <Text className="block text-xs text-on-surface-variant">详细观点</Text>
              <View className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary-container">
                <Sparkles size={12} color="#6D4DFF" />
                <Text className="block text-[10px] font-semibold text-primary">支持 AI 总结</Text>
              </View>
            </View>
            <View className="bg-surface-container rounded-xl p-3">
              <Textarea
                style={{ width: '100%', minHeight: '140px', fontSize: '14px', lineHeight: '1.6', color: '#161826', backgroundColor: 'transparent' }}
                placeholder="分析逻辑、风险点、关键价位..."
                
                value={content}
                onInput={(e) => setContent(e.detail.value)}
                maxlength={2000}
              />
            </View>
          </View>
        </View>

        {/* 图片附件 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <View className="flex items-center justify-between mb-2">
              <Text className="block text-xs text-on-surface-variant">截图附件 {images.length > 0 && `(${images.length}/9)`}</Text>
              {uploading && <Text className="block text-[10px] text-primary">上传中...</Text>}
            </View>
            <View className="grid grid-cols-3 gap-2">
              {images.map((url, i) => (
                <View key={i} className="relative aspect-square rounded-xl overflow-hidden bg-surface-container">
                  <Image src={url} mode="aspectFill" className="w-full h-full" />
                  <View
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => onRemoveImage(i)}
                  >
                    <X size={14} color="#ffffff" />
                  </View>
                </View>
              ))}
              {images.length < 9 && (
                <View
                  className="aspect-square rounded-xl flex flex-col items-center justify-center bg-surface-container border-2 border-dashed"
                  style={{ borderColor: 'rgba(109, 77, 255, 0.30)' }}
                  onClick={onPickImages}
                >
                  <ImageIcon size={20} color="#6D4DFF" />
                  <Text className="block text-[10px] text-on-surface-variant mt-1">添加截图</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 标签 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <Text className="block text-xs text-on-surface-variant mb-2">标签</Text>
            <View className="flex flex-wrap gap-2 mb-2">
              {tags.map((t) => (
                <View
                  key={t}
                  className="px-3 py-1 rounded-full flex items-center gap-1 bg-primary-container"
                >
                  <Text className="block text-xs font-semibold text-primary">{t}</Text>
                  <X size={12} color="#6D4DFF" onClick={() => onRemoveTag(t)} />
                </View>
              ))}
            </View>
            <View className="flex items-center gap-2">
              <View className="flex-1 bg-surface-container rounded-xl px-3 py-2">
                <Input
                  className="w-full bg-transparent"
                  style={{ fontSize: '13px', color: '#161826' }}
                  placeholder="按回车添加标签"
                  
                  value={tagInput}
                  onInput={(e) => setTagInput(e.detail.value)}
                  onConfirm={onAddTag}
                  confirmType="done"
                />
              </View>
              <View
                className="px-3 py-2 rounded-xl flex items-center justify-center"
                style={{ background: '#6D4DFF' }}
                onClick={onAddTag}
              >
                <Text className="block text-xs font-semibold text-white">添加</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 关联事件 + 来源 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 space-y-3">
            <View>
              <Text className="block text-xs text-on-surface-variant mb-2">关联事件</Text>
              <View className="bg-surface-container rounded-xl px-3 py-3">
                <Input
                  className="w-full bg-transparent"
                  style={{ fontSize: '13px', color: '#161826' }}
                  placeholder="例：央行降准、半年度业绩"
                  
                  value={relatedEvent}
                  onInput={(e) => setRelatedEvent(e.detail.value)}
                  maxlength={50}
                />
              </View>
            </View>
            <View>
              <Text className="block text-xs text-on-surface-variant mb-2">来源</Text>
              <View className="bg-surface-container rounded-xl px-3 py-3">
                <Input
                  className="w-full bg-transparent"
                  style={{ fontSize: '13px', color: '#161826' }}
                  placeholder="例：东吴证券研报、雪球"
                  
                  value={source}
                  onInput={(e) => setSource(e.detail.value)}
                  maxlength={50}
                />
              </View>
            </View>
          </View>
        </View>

        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
