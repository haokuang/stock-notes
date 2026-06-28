import { View, Text, ScrollView } from '@tarojs/components'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Network } from '@/network'
import { X, Sparkles, FileText, PenLine, Eye, Upload, File } from 'lucide-react-taro'
import {
  buildNoteMutation,
  buildNotePayload,
  formatResearchSubjectOption,
  parseNoteEditorRoute,
  resolveNoteTitle,
} from './note-editor-logic'
import type { NoteType } from './note-editor-logic'

interface StockOption {
  id: string
  code: string
  name: string
  subject_type: 'stock' | 'market'
}

interface ExistingNote {
  id: string
  stock_id: string
  stock_code: string
  stock_name: string
  type: NoteType
  title: string
  content: string
  doc_md?: string | null
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function NoteEditPage() {
  const [noteId, setNoteId] = useState('')
  const [stockId, setStockId] = useState('')
  const [stockName, setStockName] = useState('')
  const [stocks, setStocks] = useState<StockOption[]>([])
  const [needsStockSelection, setNeedsStockSelection] = useState(false)
  const [type, setType] = useState<NoteType>('note')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [docMd, setDocMd] = useState('')
  const [docFileName, setDocFileName] = useState('')
  const [docFileSize, setDocFileSize] = useState(0)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [docUploading, setDocUploading] = useState(false)

  const loadStockOptions = async () => {
    const res = await Network.request<{ data: StockOption[] }>({
      url: '/api/stocks',
    })
    setStocks(res.data?.data ?? [])
  }

  useLoad(async (opts) => {
    const route = parseNoteEditorRoute(opts)
    setNoteId(route.noteId)
    setStockId(route.stockId)
    setStockName(route.stockName)
    setType(route.requestedType)
    setNeedsStockSelection(!route.isEditing && !route.stockId)
    setLoading(true)
    setLoadError('')

    try {
      if (route.isEditing) {
        const res = await Network.request<{ data: ExistingNote }>({
          url: `/api/notes/${route.noteId}`,
        })
        const note = res.data?.data
        if (!note) throw new Error('笔记不存在')

        setStockId(note.stock_id)
        setStockName(note.stock_name)
        setType(note.type)
        setTitle(note.title ?? '')
        setContent(note.content ?? '')

        if (note.type === 'doc') {
          const md = note.doc_md ?? ''
          setDocMd(md)
          setDocFileName(`${note.title || 'document'}.md`)
          setDocFileSize(md.length)
        }
      } else if (route.stockId) {
        if (!route.stockName) {
          const res = await Network.request<{ data: StockOption }>({
            url: `/api/stocks/${route.stockId}`,
          })
          setStockName(res.data?.data?.name ?? '')
        }
      } else {
        await loadStockOptions()
      }
    } catch (e) {
      console.error('[note-edit] load failed', e)
      setLoadError('加载编辑信息失败，请返回后重试')
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  })

  useDidShow(() => {
    if (!needsStockSelection || loading) return
    loadStockOptions().catch((e) => {
      console.error('[note-edit] reload stocks failed', e)
    })
  })

  const onPickMd = async () => {
    try {
      setDocUploading(true)
      // 微信/抖音小程序使用 chooseMessageFile；H5 走同一 API（Taro 内部映射到 <input type=file>）
      const res = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['md', 'markdown', 'txt'],
      } as any)
      const files = (res as any).tempFiles ?? []
      if (!files.length) return
      const f = files[0]
      const filePath: string = f.path
      const fileName: string = f.name ?? 'untitled.md'
      const fileSize: number = f.size ?? 0
      // 5MB 限制
      if (fileSize > 5 * 1024 * 1024) {
        Taro.showToast({ title: '文件过大（限 5MB）', icon: 'none' })
        return
      }
      // 读取文本内容
      const fs = Taro.getFileSystemManager()
      const text: string = await new Promise((resolve, reject) => {
        fs.readFile({
          filePath,
          encoding: 'utf8',
          success: (r) => resolve((r.data as string) || ''),
          fail: (e) => reject(e),
        } as any)
      })
      if (!text.trim()) {
        Taro.showToast({ title: '文件内容为空', icon: 'none' })
        return
      }
      setDocMd(text)
      setDocFileName(fileName)
      setDocFileSize(fileSize)
      // 自动用文件名（去后缀）作为默认标题
      if (!title.trim()) {
        const stem = fileName.replace(/\.(md|markdown|txt)$/i, '')
        setTitle(stem)
      }
      // 重置预览
      setShowPreview(false)
      setPreviewHtml('')
    } catch (e: any) {
      console.error('[note-edit] pick md failed', e)
      if (e?.errMsg && !/cancel/i.test(e.errMsg)) {
        Taro.showToast({ title: '读取失败', icon: 'none' })
      }
    } finally {
      setDocUploading(false)
    }
  }

  const onRemoveDoc = () => {
    setDocMd('')
    setDocFileName('')
    setDocFileSize(0)
    setShowPreview(false)
    setPreviewHtml('')
  }

  const togglePreview = async () => {
    if (!showPreview) {
      if (!docMd.trim()) {
        Taro.showToast({ title: '请先上传 MD 文件', icon: 'none' })
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
    if (loading || saving || loadError) return
    if (!stockId) {
      Taro.showToast({ title: '请选择关联标的', icon: 'none' })
      return
    }
    if (type === 'doc' && !docMd.trim()) {
      Taro.showToast({ title: '请上传 MD 文件', icon: 'none' })
      return
    }

    const initialTitle = resolveNoteTitle({
      type,
      title,
      content,
    })
    if (!initialTitle.ok) {
      Taro.showToast({ title: initialTitle.message, icon: 'none' })
      return
    }

    setSaving(true)
    try {
      let finalTitle = initialTitle.title
      if (initialTitle.shouldSummarize) {
        try {
          Taro.showLoading({ title: 'AI 总结标题中…' })
          const aiRes = await Network.request<{ data: { title: string } }>({
            url: '/api/ai/summarize-title',
            method: 'POST',
            data: { content: content.trim() },
          })
          const resolved = resolveNoteTitle({
            type,
            title,
            content,
            aiTitle: aiRes.data?.data?.title ?? '',
          })
          if (resolved.ok) finalTitle = resolved.title
        } catch {
          finalTitle = initialTitle.title
        } finally {
          Taro.hideLoading()
        }
      }

      setTitle(finalTitle)

      const payload = buildNotePayload({
        stockId,
        type,
        title: finalTitle,
        content,
        docMd,
      }, Boolean(noteId))
      const mutation = buildNoteMutation(noteId)

      await Network.request({
        url: mutation.url,
        method: mutation.method,
        data: payload,
      })
      Taro.showToast({ title: noteId ? '已更新' : '已保存', icon: 'success' })
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
      <PageHeader
        title={
          noteId
            ? type === 'doc'
              ? '编辑文档'
              : '编辑笔记'
            : type === 'doc'
              ? '上传文档'
              : '记录笔记'
        }
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <Button
            size="sm"
            className="rounded-full"
            disabled={loading || saving || Boolean(loadError)}
            onClick={onSave}
          >
            <Text className="block text-xs font-semibold text-white">
              {saving ? '保存中' : '保存'}
            </Text>
          </Button>
        }
      />

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {loading && (
          <View className="px-4 pt-3">
            <Card className="rounded-2xl bg-white bg-opacity-72 border-white border-opacity-85">
              <CardContent className="p-4">
                <Text className="block text-sm text-on-surface-variant text-center">正在加载编辑信息...</Text>
              </CardContent>
            </Card>
          </View>
        )}

        {loadError && (
          <View className="px-4 pt-3">
            <Card className="rounded-2xl border-error bg-white bg-opacity-72">
              <CardContent className="p-4">
                <Text className="block text-sm text-error text-center">{loadError}</Text>
              </CardContent>
            </Card>
          </View>
        )}

        {/* 类型 Tab：观点 / 文档 */}
        <View className="px-4 pt-3">
          <View className="flex items-center gap-1 p-1 rounded-full bg-surface-container">
            <View
              className="flex-1 h-9 rounded-full flex items-center justify-center"
              style={{
                background: type === 'note' ? '#ffffff' : 'transparent',
                boxShadow: type === 'note' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                opacity: noteId ? 0.7 : 1,
              }}
              onClick={() => {
                if (!noteId) setType('note')
              }}
            >
              <View className="flex items-center gap-1">
                <PenLine size={14} color={type === 'note' ? '#6D4DFF' : '#5B5E72'} />
                <Text className="block text-sm font-semibold" style={{ color: type === 'note' ? '#6D4DFF' : '#5B5E72' }}>笔记</Text>
              </View>
            </View>
            <View
              className="flex-1 h-9 rounded-full flex items-center justify-center"
              style={{
                background: type === 'doc' ? '#ffffff' : 'transparent',
                boxShadow: type === 'doc' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                opacity: noteId ? 0.7 : 1,
              }}
              onClick={() => {
                if (!noteId) setType('doc')
              }}
            >
              <View className="flex items-center gap-1">
                <FileText size={14} color={type === 'doc' ? '#6D4DFF' : '#5B5E72'} />
                <Text className="block text-sm font-semibold" style={{ color: type === 'doc' ? '#6D4DFF' : '#5B5E72' }}>文档</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 股票关联 */}
        {!noteId && stocks.length > 0 ? (
          <View className="px-4 pt-3">
            <Card className="rounded-2xl bg-white bg-opacity-72 border-white border-opacity-85">
              <CardContent className="p-4">
                <Text className="block text-xs text-on-surface-variant mb-2">关联标的</Text>
                <Select
                  value={stockId}
                  onValueChange={(value) => {
                    const selected = stocks.find((stock) => stock.id === value)
                    setStockId(value)
                    setStockName(selected?.name ?? '')
                  }}
                >
                  <SelectTrigger className="w-full h-10 bg-surface-container border-0">
                    <SelectValue placeholder="请选择一个自选标的" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {stocks.map((stock) => (
                      <SelectItem key={stock.id} value={stock.id}>
                        {formatResearchSubjectOption(stock)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </View>
        ) : stockName ? (
          <View className="px-4 pt-3">
            <Card className="rounded-2xl bg-white bg-opacity-72 border-white border-opacity-85">
              <CardContent className="p-3 flex items-center gap-2">
                <View className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
                  <Text className="block text-sm font-bold text-primary">{stockName.slice(0, 1)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="block text-xs text-on-surface-variant">关联标的</Text>
                  <Text className="block text-sm font-semibold text-on-surface mt-1">{stockName}</Text>
                </View>
              </CardContent>
            </Card>
          </View>
        ) : !loading && !loadError ? (
          <View className="px-4 pt-3">
            <Card className="rounded-2xl bg-white bg-opacity-72 border-white border-opacity-85">
              <CardContent className="p-5 flex flex-col items-center">
                <Text className="block text-sm font-semibold text-on-surface">还没有可关联的股票</Text>
                <Text className="block text-xs text-on-surface-variant mt-2">请先添加一个研究标的，再记录观点或文档</Text>
                <Button
                  size="sm"
                  className="mt-4 rounded-full"
                  onClick={() => Taro.navigateTo({ url: '/pages/stock-add/index' })}
                >
                  <Text className="block text-xs text-white">添加标的</Text>
                </Button>
              </CardContent>
            </Card>
          </View>
        ) : null}

        {/* 标题（仅观点模式；文档标题自动从文件名取） */}
        {type === 'note' && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="flex items-center justify-between mb-2">
                <Text className="block text-xs text-on-surface-variant">标题</Text>
                <View className="flex items-center gap-2">
                  <Text className="block text-xs text-on-surface-variant">留空则 AI 总结</Text>
                  <Text className="block text-xs text-on-surface-variant">
                    {title.length}/50
                  </Text>
                </View>
              </View>
              <View className="bg-surface-container rounded-xl px-4 py-3">
                <Input
                  className="w-full bg-transparent text-base font-semibold text-on-surface"
                  placeholder="一句话总结你的观点..."
                  value={title}
                  onInput={(e) => setTitle(e.detail.value)}
                  maxlength={50}
                />
              </View>
            </View>
          </View>
        )}

        {/* ===== 笔记模式 ===== */}
        {type === 'note' && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Textarea
                autoHeight
                style={{
                  width: '100%',
                  minHeight: '160px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#161826',
                }}
                placeholder="记录你的笔记…"
                value={content}
                onInput={(e) => setContent(e.detail.value)}
                maxlength={5000}
              />
            </View>
          </View>
        )}

        {/* ===== 文档模式：上传 .md 文件 ===== */}
        {type === 'doc' && (
          <>
            <View className="px-4 pt-3">
              <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
                <View className="flex items-center justify-between mb-3">
                  <View className="flex items-center gap-2">
                    <FileText size={14} color="#5B5E72" />
                    <Text className="block text-xs text-on-surface-variant">MD 文档</Text>
                  </View>
                  {docMd && (
                    <View
                      className="flex items-center gap-1 px-2 py-1 rounded-full"
                      style={{ background: showPreview ? 'rgba(109, 77, 255, 0.10)' : 'rgba(91, 94, 114, 0.10)' }}
                      onClick={togglePreview}
                    >
                      <Eye size={12} color={showPreview ? '#6D4DFF' : '#5B5E72'} />
                      <Text className="block text-[10px] font-semibold" style={{ color: showPreview ? '#6D4DFF' : '#5B5E72' }}>
                        {showPreview ? '返回文件' : '预览渲染'}
                      </Text>
                    </View>
                  )}
                </View>

                {!docMd ? (
                  // 未上传：显示选择按钮
                  <View
                    className="rounded-2xl flex flex-col items-center justify-center py-10 px-6"
                    style={{ background: 'rgba(109, 77, 255, 0.04)', border: '2px dashed rgba(109, 77, 255, 0.30)' }}
                    hoverClass="opacity-80"
                    onClick={onPickMd}
                  >
                    <View className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(109, 77, 255, 0.10)' }}>
                      <Upload size={26} color="#6D4DFF" />
                    </View>
                    <Text className="block text-base font-semibold text-on-surface mb-1">
                      {docUploading ? '读取中...' : '选择 .md 文件'}
                    </Text>
                    <Text className="block text-xs text-on-surface-variant text-center">
                      支持 .md / .markdown / .txt  ·  最大 5MB
                    </Text>
                  </View>
                ) : !showPreview ? (
                  // 已上传但未预览：显示文件信息卡
                  <View className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(109, 77, 255, 0.06)', border: '1px solid rgba(109, 77, 255, 0.20)' }}>
                    <View className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(109, 77, 255, 0.12)' }}>
                      <File size={22} color="#6D4DFF" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="block text-sm font-semibold text-on-surface truncate" numberOfLines={1}>
                        {docFileName}
                      </Text>
                      <View className="flex items-center gap-2 mt-1">
                        <Text className="block text-[10px] text-on-surface-variant">{formatSize(docFileSize)}</Text>
                        <View className="w-1 h-1 rounded-full bg-on-surface-variant opacity-40" />
                        <Text className="block text-[10px] text-on-surface-variant">{docMd.length.toLocaleString()} 字符</Text>
                      </View>
                    </View>
                    <View
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(91, 94, 114, 0.10)' }}
                      hoverClass="opacity-70"
                      onClick={onRemoveDoc}
                    >
                      <X size={16} color="#5B5E72" />
                    </View>
                  </View>
                ) : (
                  // 预览模式：渲染 HTML
                  <View className="bg-surface-container rounded-xl p-4 min-h-[280px]">
                    {/* @ts-ignore - rich-text is a Taro component */}
                    {/* @ts-ignore */}
                    <rich-text nodes={previewHtml} className="block text-sm text-on-surface leading-relaxed" />
                  </View>
                )}

                {docMd && !showPreview && (
                  <View
                    className="mt-2 flex items-center justify-center gap-1 py-2 rounded-xl"
                    style={{ background: 'rgba(91, 94, 114, 0.08)' }}
                    hoverClass="opacity-70"
                    onClick={onPickMd}
                  >
                    <Upload size={12} color="#5B5E72" />
                    <Text className="block text-xs font-semibold text-on-surface-variant">重新上传</Text>
                  </View>
                )}

                {docMd && (
                  <View className="mt-2 flex items-center gap-1">
                    <Sparkles size={10} color="#6D4DFF" />
                    <Text className="block text-[10px] text-on-surface-variant">
                      服务端渲染为 HTML · 库内可全文阅读
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        <View className="h-4" />
      </ScrollView>
    </View>
  )
}
