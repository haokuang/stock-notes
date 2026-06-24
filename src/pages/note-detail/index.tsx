import { View, Text, ScrollView, Image, RichText } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Network } from '@/network'
import { IS_H5_ENV } from '@/presets/env'
import { Clock, FileText, Sparkles, Trash2, Pencil } from 'lucide-react-taro'
import {
  NoteSelectionToolbar,
  type NoteSelectionToolbarProps,
} from '@/components/note-selection-toolbar'
import { PageHeader } from '@/components/ui/page-header'
import { formatNotePrice, hasNotePrice } from './note-detail-logic'
import type { NotePrice } from './note-detail-logic'
import {
  buildSelectionAnchor,
  clampToolbarPosition,
  overlapsAny,
  type TextRange,
} from './selection-logic'

interface NoteHighlight {
  id: string
  selected_text: string
  start_offset: number
  end_offset: number
}

interface Note {
  id: string
  stock_id: string
  stock_name: string
  stock_code: string
  type: 'note' | 'doc'
  title: string
  content: string
  doc_md?: string | null
  rendered_content: string
  content_hash: string
  highlights: NoteHighlight[]
  direction: 'bull' | 'bear' | 'neutral' | null
  entry_price: NotePrice
  target_price: NotePrice
  stop_loss: NotePrice
  tags: string[] | null
  images: string[] | null
  related_event: string | null
  source: string | null
  ai_summary: string | null
  created_at: string
  updated_at: string
}

interface ToolbarState {
  mode: 'selection' | 'highlight'
  left: number
  top: number
  selectedText: string
  highlightId?: string
}

export default function NoteDetailPage() {
  const [note, setNote] = useState<Note | null>(null)
  const [noteId, setNoteId] = useState('')
  const [activeImg, setActiveImg] = useState<string | null>(null)
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  const [busy, setBusy] = useState(false)
  const mdContentRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<ToolbarState | null>(null)

  const loadNote = async (nid: string) => {
    if (!nid) return
    try {
      const res = await Network.request<{ data: Note }>({ url: `/api/notes/${nid}` })
      console.log('[note-detail]', res.data)
      setNote(res.data?.data ?? null)
    } catch (e) {
      console.error('[note-detail] load failed', e)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    }
  }

  useLoad((opts) => {
    const nid = opts?.note_id ?? ''
    setNoteId(nid)
    loadNote(nid)
  })

  useDidShow(() => {
    if (noteId) loadNote(noteId)
  })

  // H5 端：渲染服务端注入的 HTML（Markdown 排版 + 高亮 span）
  useEffect(() => {
    if (!IS_H5_ENV || !mdContentRef.current || !note?.rendered_content) return
    mdContentRef.current.innerHTML = note.rendered_content
    setToolbar(null)
  }, [note?.rendered_content, note?.id])

  // 同步 toolbar ref 给 window 上的 listener
  useEffect(() => {
    toolbarRef.current = toolbar
  }, [toolbar])

  const closeToolbar = useCallback(() => setToolbar(null), [])

  // ============ H5 选区监听 ============
  useEffect(() => {
    if (!IS_H5_ENV) return
    let timer: any = null
    const handleSelectionChange = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(tryOpenSelectionToolbar, 80)
    }
    const tryOpenSelectionToolbar = () => {
      const root = mdContentRef.current
      if (!root) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // 不主动关闭,留 toolbar 给"已点高亮"模式
        return
      }
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) {
        return
      }
      const offsets = computeRangeOffsets(root, range)
      if (!offsets) return
      const { start, end } = offsets
      const text = root.textContent ?? ''
      if (end <= start) return
      const anchor = buildSelectionAnchor(text, start, end)
      if (!anchor) return
      const highlightRanges: TextRange[] = (note?.highlights ?? []).map((h) => ({
        startOffset: h.start_offset,
        endOffset: h.end_offset,
      }))
      if (overlapsAny({ startOffset: start, endOffset: end }, highlightRanges)) {
        // 与已有高亮重叠:不显示自定义工具条,让浏览器原生菜单接管
        return
      }
      const rect = range.getBoundingClientRect()
      const pos = clampToolbarPosition({
        selectionLeft: rect.left,
        selectionTop: rect.top,
        selectionBottom: rect.bottom,
        selectionWidth: rect.width,
        toolbarWidth: 180,
        toolbarHeight: 40,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })
      setToolbar({
        mode: 'selection',
        left: pos.left,
        top: pos.top,
        selectedText: anchor.selectedText,
      })
    }
    const handleDocClick = (e: MouseEvent) => {
      // 点击工具条外部,关闭
      const t = e.target as HTMLElement | null
      if (t && t.closest('[data-note-toolbar]')) return
      // 命中已有高亮,见下方 click delegation
      if (t && t.closest('[data-highlight-id]')) return
      closeToolbar()
    }
    const handleHighlightClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      const span = t.closest('[data-highlight-id]') as HTMLElement | null
      if (!span) return
      const id = span.getAttribute('data-highlight-id') || ''
      const matched = (note?.highlights ?? []).find((h) => h.id === id)
      if (!matched) return
      const rect = span.getBoundingClientRect()
      const pos = clampToolbarPosition({
        selectionLeft: rect.left,
        selectionTop: rect.top,
        selectionBottom: rect.bottom,
        selectionWidth: rect.width,
        toolbarWidth: 180,
        toolbarHeight: 40,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })
      setToolbar({
        mode: 'highlight',
        left: pos.left,
        top: pos.top,
        selectedText: matched.selected_text,
        highlightId: matched.id,
      })
    }
    const handleScroll = () => closeToolbar()
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mousedown', handleDocClick)
    document.addEventListener('click', handleHighlightClick, true)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mousedown', handleDocClick)
      document.removeEventListener('click', handleHighlightClick, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [note?.highlights, closeToolbar])

  const onCreateHighlight = async () => {
    if (!note || !toolbar || toolbar.mode !== 'selection') return
    const root = mdContentRef.current
    if (!root) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const offsets = computeRangeOffsets(root, range)
    if (!offsets) return
    const { start, end } = offsets
    const text = root.textContent ?? ''
    const anchor = buildSelectionAnchor(text, start, end)
    if (!anchor) return
    setBusy(true)
    try {
      await Network.request({
        url: `/api/notes/${note.id}/highlights`,
        method: 'POST',
        data: {
          selected_text: anchor.selectedText,
          prefix_text: anchor.prefixText,
          suffix_text: anchor.suffixText,
          start_offset: anchor.startOffset,
          end_offset: anchor.endOffset,
          source_hash: note.content_hash,
        },
      })
      sel.removeAllRanges()
      setToolbar(null)
      await loadNote(noteId)
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      if (msg.includes('409') || msg.includes('Conflict')) {
        Taro.showToast({ title: '正文已更新,请重新选择', icon: 'none' })
        await loadNote(noteId)
      } else {
        Taro.showToast({ title: '高亮失败', icon: 'none' })
      }
    } finally {
      setBusy(false)
    }
  }

  const onCopy = async () => {
    const text = toolbar?.selectedText
    if (!text) return
    try {
      await Taro.setClipboardData({ data: text })
      Taro.showToast({ title: '已复制', icon: 'success' })
    } catch {
      Taro.showToast({ title: '复制失败', icon: 'none' })
    }
    setToolbar(null)
  }

  const onRemoveHighlight = async () => {
    if (!note || !toolbar || toolbar.mode !== 'highlight' || !toolbar.highlightId) return
    setBusy(true)
    try {
      await Network.request({
        url: `/api/notes/${note.id}/highlights/${toolbar.highlightId}`,
        method: 'DELETE',
      })
      setToolbar(null)
      await loadNote(noteId)
    } catch (e) {
      console.error('[note-detail] delete highlight failed', e)
      Taro.showToast({ title: '删除失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    const r = await Taro.showModal({ title: '删除', content: '确定要删除吗？', confirmColor: '#D11A4A' })
    if (!r.confirm) return
    try {
      await Network.request({ url: `/api/notes/${noteId}`, method: 'DELETE' })
      Taro.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 500)
    } catch (e) {
      console.error('[note-detail] delete failed', e)
      Taro.showToast({ title: '删除失败', icon: 'none' })
    }
  }

  const onEdit = () => {
    if (!note) return
    Taro.navigateTo({ url: `/pages/note-edit/index?note_id=${noteId}&stock_id=${note.stock_id}` })
  }

  if (!note) {
    return (
      <View className="w-full min-h-full" style={{ background: '#EEF0F6' }}>
        <View className="p-4">
          <Text className="block text-sm text-on-surface-variant text-center mt-10">加载中...</Text>
        </View>
      </View>
    )
  }

  const isDoc = note.type === 'doc'
  const dirColor = note.direction === 'bull' ? '#0F8C66' : note.direction === 'bear' ? '#D11A4A' : '#B45309'
  const dirLabel = note.direction === 'bull' ? '看多' : note.direction === 'bear' ? '看空' : '中性'
  const dirBg = note.direction === 'bull' ? 'rgba(15, 140, 102, 0.10)' : note.direction === 'bear' ? 'rgba(209, 26, 74, 0.10)' : 'rgba(180, 83, 9, 0.10)'

  const toolbarProps: NoteSelectionToolbarProps | null = toolbar
    ? {
        mode: toolbar.mode,
        left: toolbar.left,
        top: toolbar.top,
        busy,
        onHighlight: toolbar.mode === 'selection' ? onCreateHighlight : undefined,
        onCopy: onCopy,
        onRemove: toolbar.mode === 'highlight' ? onRemoveHighlight : undefined,
      }
    : null

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      {/* Header */}
      <PageHeader
        title={isDoc ? '文档详情' : '笔记详情'}
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <View className="flex items-center gap-1">
            <View className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onEdit}>
              <Pencil size={18} color="#5B5E72" />
            </View>
            <View className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onDelete}>
              <Trash2 size={18} color="#D11A4A" />
            </View>
          </View>
        }
      />

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 类型徽章 + 股票关联 + 标题 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <View className="flex items-center gap-2 mb-3">
              {isDoc ? (
                <View className="px-3 py-2 rounded-full flex items-center gap-1" style={{ background: 'rgba(15, 140, 102, 0.10)' }}>
                  <FileText size={14} color="#0F8C66" />
                  <Text className="block text-sm font-semibold" style={{ color: '#0F8C66' }}>文档</Text>
                </View>
              ) : (
                <View className="px-3 py-2 rounded-full" style={{ background: dirBg }}>
                  <Text className="block text-sm font-semibold" style={{ color: dirColor }}>{dirLabel}</Text>
                </View>
              )}
              <View
                className="flex items-center gap-2 px-3 py-2 rounded-full"
                style={{ background: 'rgba(109, 77, 255, 0.08)' }}
                onClick={() => Taro.navigateTo({ url: `/pages/stock/index?stock_id=${note.stock_id}` })}
              >
                <Text className="block text-sm font-semibold text-primary">{note.stock_name}</Text>
                <Text className="block text-xs text-on-surface-variant tabular-nums">{note.stock_code}</Text>
              </View>
            </View>
            <Text className="block text-xl font-bold text-on-surface leading-tight">{note.title}</Text>
            <View className="flex items-center gap-2 mt-2">
              <Clock size={12} color="#9498AC" />
              <Text className="block text-xs text-on-surface-variant tabular-nums">{note.created_at?.replace('T', ' ').slice(0, 16)}</Text>
            </View>
          </View>
        </View>

        {/* 正文:H5 注入 rendered_content(Markdown + 高亮);小程序 plain text fallback */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <View className="flex items-center gap-2 mb-3">
              <FileText size={14} color="#5B5E72" />
              <Text className="block text-sm font-semibold text-on-surface">{isDoc ? '文档内容' : '详细观点'}</Text>
            </View>
            {IS_H5_ENV ? (
              <View
                ref={mdContentRef as any}
                className="md-content block text-sm text-on-surface leading-relaxed"
                style={{ wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' as any }}
              />
            ) : (
              <RichText
                nodes={note.rendered_content || note.content || ''}
                userSelect={true as any}
                selectable={true as any}
                className="md-content block text-sm text-on-surface leading-relaxed"
                style={{ wordBreak: 'break-word' }}
              />
            )}
          </View>
        </View>

        {/* 观点：价格点位 */}
        {!isDoc && [note.entry_price, note.target_price, note.stop_loss].some(hasNotePrice) && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="grid grid-cols-3 gap-3">
                {[
                  { label: '入场', value: note.entry_price, color: '#6D4DFF' },
                  { label: '目标', value: note.target_price, color: '#0F8C66' },
                  { label: '止损', value: note.stop_loss, color: '#D11A4A' },
                ].map((p) => (
                  <View key={p.label} className="flex flex-col">
                    <Text className="block text-[10px] mb-1" style={{ color: p.color }}>{p.label}</Text>
                    <Text className="block text-base font-bold text-on-surface tabular-nums">
                      {formatNotePrice(p.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* AI 总结 */}
        {note.ai_summary && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 border" style={{ background: 'rgba(109, 77, 255, 0.04)', borderColor: 'rgba(109, 77, 255, 0.20)' }}>
              <View className="flex items-center gap-2 mb-2">
                <Sparkles size={14} color="#6D4DFF" />
                <Text className="block text-sm font-semibold text-primary">AI 总结</Text>
              </View>
              <Text className="block text-sm text-on-surface leading-relaxed" style={{ wordBreak: 'break-word' }}>{note.ai_summary}</Text>
            </View>
          </View>
        )}

        {/* 图片 */}
        {!isDoc && note.images && note.images.length > 0 && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <Text className="block text-sm font-semibold text-on-surface mb-2">截图 ({note.images.length})</Text>
              <View className="grid grid-cols-3 gap-2">
                {note.images.map((url, i) => (
                  <View
                    key={i}
                    className="aspect-square rounded-xl overflow-hidden bg-surface-container"
                    onClick={() => setActiveImg(url)}
                  >
                    <Image src={url} mode="aspectFill" className="w-full h-full" />
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* 标签 + 关联事件 + 来源（仅观点） */}
        {!isDoc && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85 space-y-3">
              {note.tags && note.tags.length > 0 && (
                <View>
                  <Text className="block text-xs text-on-surface-variant mb-2">标签</Text>
                  <View className="flex flex-wrap gap-2">
                    {note.tags.map((t) => (
                      <View key={t} className="px-3 py-1 rounded-full bg-surface-container">
                        <Text className="block text-xs text-on-surface">{t}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {note.related_event && (
                <View>
                  <Text className="block text-xs text-on-surface-variant mb-1">关联事件</Text>
                  <Text className="block text-sm text-on-surface">{note.related_event}</Text>
                </View>
              )}
              {note.source && (
                <View>
                  <Text className="block text-xs text-on-surface-variant mb-1">来源</Text>
                  <Text className="block text-sm text-on-surface">{note.source}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View className="h-4" />
      </ScrollView>

      {/* 图片预览 */}
      {activeImg && (
        <View
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setActiveImg(null)}
        >
          <Image src={activeImg} mode="aspectFit" className="w-full h-full" />
        </View>
      )}

      {/* H5 选区高亮工具条 */}
      {IS_H5_ENV && toolbarProps && (
        <View data-note-toolbar>
          <NoteSelectionToolbar {...toolbarProps} />
        </View>
      )}
    </View>
  )
}

// ============ DOM helpers ============

/**
 * 把 Range 在 root 内的字符偏移算出来。
 * 起点 = root 到 range.startContainer 的文本长度 + startOffset
 * 终点 = root 到 range.endContainer 的文本长度 + endOffset
 */
function computeRangeOffsets(root: HTMLElement, range: Range): { start: number; end: number } | null {
  try {
    const pre = range.cloneRange()
    pre.selectNodeContents(root)
    pre.setEnd(range.startContainer, range.startOffset)
    const start = pre.toString().length
    const full = root.textContent ?? ''
    const end = start + range.toString().length
    if (end > full.length) return null
    return { start, end }
  } catch {
    return null
  }
}
