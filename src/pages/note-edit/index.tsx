import { View, Text, ScrollView, Image } from '@tarojs/components'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { ArrowLeft, X, Image as ImageIcon, Sparkles, FileText, PenLine, Eye } from 'lucide-react-taro'

const DIRECTIONS: { value: 'bull' | 'bear' | 'neutral'; label: string; color: string; bg: string }[] = [
  { value: 'bull', label: '看多', color: '#0F8C66', bg: 'rgba(15, 140, 102, 0.10)' },
  { value: 'neutral', label: '中性', color: '#B45309', bg: 'rgba(180, 83, 9, 0.10)' },
  { value: 'bear', label: '看空', color: '#D11A4A', bg: 'rgba(209, 26, 74, 0.10)' },
]

type NoteType = 'note' | 'doc'

export default function NoteEditPage() {
  const [stockId, setStockId] = useState('')
  const [stockName, setStockName] = useState('')
  const [type, setType] = useState<NoteType>('note')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [docMd, setDocMd] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
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

  const insertMd = (snippet: string) => {
    setDocMd((prev) => prev + (prev.endsWith('\n') || prev.length === 0 ? '' : '\n') + snippet + '\n')
  }

  const togglePreview = async () => {
    if (!showPreview) {
      if (!docMd.trim()) {
        Taro.showToast({ title: '请先输入文档内容', icon: 'none' })
        return
      }
      try {
        const res = await Network.request<{ data: { html: string } }>({
          url: '/api/notes/render-md',
          method: 'POST',
          data: { md: docMd },
        })
        setPreviewHtml(res.data?.data?.html ?? '')
        setShowPreview(true)
      } catch (e) {
        console.error('[note-edit] render md failed', e)
        Taro.showToast({ title: '渲染失败', icon: 'none' })
      }
    } else {
      setShowPreview(false)
    }
  }

  const onSave = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (!stockId) {
      Taro.showToast({ title: '缺少股票信息', icon: 'none' })
      return
    }
    if (type === 'doc' && !docMd.trim()) {
      Taro.showToast({ title: '请输入文档内容', icon: 'none' })
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        stock_id: stockId,
        type,
        title: title.trim(),
      }
      if (type === 'doc') {
        payload.doc_md = docMd
        payload.content = '' // 由后端渲染填充
      } else {
        payload.content = content.trim()
        payload.direction = direction
        payload.entry_price = entryPrice ? parseFloat(entryPrice) : null
        payload.target_price = targetPrice ? parseFloat(targetPrice) : null
        payload.stop_loss = stopLoss ? parseFloat(stopLoss) : null
        payload.tags = tags
        payload.images = images
        payload.related_event = relatedEvent.trim() || null
        payload.source = source.trim() || null
      }
      await Network.request({
        url: '/api/notes',
        method: 'POST',
        data: payload,
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
        <Text className="block text-base font-semibold text-on-surface">
          {type === 'doc' ? '上传文档' : '记录观点'}
        </Text>
        <View
          className="px-4 py-2 rounded-full"
          style={{ background: saving ? 'rgba(109, 77, 255, 0.4)' : '#6D4DFF' }}
          onClick={onSave}
        >
          <Text className="block text-xs font-semibold text-white">{saving ? '保存中' : '保存'}</Text>
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 类型 Tab：观点 / 文档 */}
        <View className="px-4 pt-3">
          <View className="flex items-center gap-1 p-1 rounded-full bg-surface-container">
            <View
              className="flex-1 h-9 rounded-full flex items-center justify-center"
              style={{ background: type === 'note' ? '#ffffff' : 'transparent', boxShadow: type === 'note' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}
              onClick={() => setType('note')}
            >
              <View className="flex items-center gap-1">
                <PenLine size={14} color={type === 'note' ? '#6D4DFF' : '#5B5E72'} />
                <Text className="block text-sm font-semibold" style={{ color: type === 'note' ? '#6D4DFF' : '#5B5E72' }}>观点</Text>
              </View>
            </View>
            <View
              className="flex-1 h-9 rounded-full flex items-center justify-center"
              style={{ background: type === 'doc' ? '#ffffff' : 'transparent', boxShadow: type === 'doc' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}
              onClick={() => setType('doc')}
            >
              <View className="flex items-center gap-1">
                <FileText size={14} color={type === 'doc' ? '#6D4DFF' : '#5B5E72'} />
                <Text className="block text-sm font-semibold" style={{ color: type === 'doc' ? '#6D4DFF' : '#5B5E72' }}>文档</Text>
              </View>
            </View>
          </View>
        </View>

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
            <View className="flex items-center justify-between mb-2">
              <Text className="block text-xs text-on-surface-variant">标题</Text>
              <Text className="block text-[10px] text-on-surface-variant">{title.length}/50</Text>
            </View>
            <View className="bg-surface-container rounded-xl px-4 py-3">
              <Input
                className="w-full bg-transparent"
                style={{ fontSize: '16px', fontWeight: 600, color: '#161826' }}
                placeholder={type === 'doc' ? '文档名称...' : '一句话总结你的观点...'}
                
                value={title}
                onInput={(e) => setTitle(e.detail.value)}
                maxlength={50}
              />
            </View>
          </View>
        </View>

        {/* ===== 观点模式 ===== */}
        {type === 'note' && (
          <>
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
          </>
        )}

        {/* ===== 文档模式 ===== */}
        {type === 'doc' && (
          <>
            {/* Markdown 编辑器 */}
            <View className="px-4 pt-3">
              <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                <View className="flex items-center justify-between mb-2">
                  <View className="flex items-center gap-2">
                    <FileText size={14} color="#5B5E72" />
                    <Text className="block text-xs text-on-surface-variant">Markdown 内容</Text>
                  </View>
                  <View
                    className="flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ background: showPreview ? 'rgba(109, 77, 255, 0.10)' : 'rgba(91, 94, 114, 0.10)' }}
                    onClick={togglePreview}
                  >
                    <Eye size={12} color={showPreview ? '#6D4DFF' : '#5B5E72'} />
                    <Text className="block text-[10px] font-semibold" style={{ color: showPreview ? '#6D4DFF' : '#5B5E72' }}>
                      {showPreview ? '返回编辑' : '预览'}
                    </Text>
                  </View>
                </View>

                {/* 工具栏 */}
                <View className="flex items-center gap-1 mb-2 p-1 rounded-xl bg-surface-container overflow-x-auto scrollbar-hide">
                  {[
                    { label: 'H1', snippet: '# 标题' },
                    { label: 'H2', snippet: '## 副标题' },
                    { label: 'B', snippet: '**加粗**', wrap: true },
                    { label: 'I', snippet: '*斜体*', wrap: true },
                    { label: '—', snippet: '引用' },
                    { label: '•', snippet: '- 列表项' },
                    { label: '1.', snippet: '1. 列表项' },
                    { label: '```', snippet: '```\n代码块\n```' },
                    { label: '[ ]', snippet: '[链接](https://)' },
                  ].map((b) => (
                    <View
                      key={b.label}
                      className="shrink-0 px-2 py-1 rounded-md flex items-center justify-center bg-white"
                      style={{ minWidth: '32px' }}
                      onClick={() => {
                        if (b.wrap) {
                          setDocMd((prev) => prev + b.snippet)
                        } else {
                          insertMd(b.snippet)
                        }
                      }}
                    >
                      <Text className="block text-[11px] font-semibold text-on-surface" style={{ fontStyle: b.label === 'I' ? 'italic' : 'normal', fontWeight: b.label === 'B' ? 700 : 500 }}>
                        {b.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {!showPreview ? (
                  <View className="bg-surface-container rounded-xl p-3">
                    <Textarea
                      style={{ width: '100%', minHeight: '320px', fontSize: '13px', lineHeight: '1.7', color: '#161826', backgroundColor: 'transparent', fontFamily: 'monospace' }}
                      placeholder={'# 标题\n\n## 章节\n\n**核心观点**：xxx\n\n- 要点 1\n- 要点 2\n\n> 重要提示'}
                      
                      value={docMd}
                      onInput={(e) => setDocMd(e.detail.value)}
                      maxlength={20000}
                    />
                  </View>
                ) : (
                  <View className="bg-surface-container rounded-xl p-4 min-h-[320px]">
                    {/* @ts-ignore - rich-text is a Taro component */}
                    {/* @ts-ignore */}
                    <rich-text nodes={previewHtml} className="block text-sm text-on-surface leading-relaxed" />
                  </View>
                )}

                <View className="mt-2 flex items-center gap-1">
                  <Sparkles size={10} color="#6D4DFF" />
                  <Text className="block text-[10px] text-on-surface-variant">
                    支持 Markdown 语法 · 服务端渲染 · {docMd.length} 字符
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
