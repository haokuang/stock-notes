import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { useState, useRef, useEffect } from 'react'
import { Network } from '@/network'
import { IS_H5_ENV } from '@/presets/env'
import { ArrowLeft, Clock, FileText, Sparkles, Trash2, Pencil } from 'lucide-react-taro'
import { formatNotePrice, hasNotePrice } from './note-detail-logic'
import type { NotePrice } from './note-detail-logic'

interface Note {
  id: string
  stock_id: string
  stock_name: string
  stock_code: string
  type: 'note' | 'doc'
  title: string
  content: string
  doc_md?: string | null
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

export default function NoteDetailPage() {
  const [note, setNote] = useState<Note | null>(null)
  const [noteId, setNoteId] = useState('')
  const [activeImg, setActiveImg] = useState<string | null>(null)
  const mdContentRef = useRef<HTMLDivElement | null>(null)
  const isMdDoc = (note?.type === 'doc' && note?.content) ?? false

  // H5 端：文档内容用 innerHTML 注入渲染 markdown，支持长按选中
  useEffect(() => {
    if (!IS_H5_ENV || !mdContentRef.current || !isMdDoc || !note?.content) return
    mdContentRef.current.innerHTML = note.content
  }, [note?.content, isMdDoc])

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

  useLoad(async (opts) => {
    const nid = opts?.note_id ?? ''
    setNoteId(nid)
    await loadNote(nid)
  })

  useDidShow(() => {
    if (noteId) loadNote(noteId)
  })

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

  return (
    <View className="w-full min-h-full pb-8" style={{ background: '#EEF0F6' }}>
      {/* Header */}
      <View
        className="flex items-center justify-between px-4 pb-2 bg-background sticky top-0 z-40"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container" onClick={() => Taro.navigateBack()}>
          <ArrowLeft size={20} color="#161826" />
        </View>
        <Text className="block text-base font-semibold text-on-surface">{isDoc ? '文档详情' : '观点详情'}</Text>
        <View className="flex items-center gap-1">
          <View className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onEdit}>
            <Pencil size={18} color="#5B5E72" />
          </View>
          <View className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container" onClick={onDelete}>
            <Trash2 size={18} color="#D11A4A" />
          </View>
        </View>
      </View>

      <ScrollView scrollY enhanced showScrollbar={false} className="w-full">
        {/* 类型徽章 + 股票关联 + 标题 */}
        <View className="px-4 pt-3">
          <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
            <View className="flex items-center gap-2 mb-3">
              {isDoc ? (
                <View className="px-3 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(15, 140, 102, 0.10)' }}>
                  <FileText size={12} color="#0F8C66" />
                  <Text className="block text-[11px] font-semibold" style={{ color: '#0F8C66' }}>文档</Text>
                </View>
              ) : (
                <View className="px-3 py-1 rounded-full" style={{ background: dirBg }}>
                  <Text className="block text-[11px] font-semibold" style={{ color: dirColor }}>{dirLabel}</Text>
                </View>
              )}
              <View
                className="flex items-center gap-2 px-2 py-1 rounded-full"
                style={{ background: 'rgba(109, 77, 255, 0.08)' }}
                onClick={() => Taro.navigateTo({ url: `/pages/stock/index?stock_id=${note.stock_id}` })}
              >
                <Text className="block text-[11px] font-semibold text-primary">{note.stock_name}</Text>
                <Text className="block text-[10px] text-on-surface-variant tabular-nums">{note.stock_code}</Text>
              </View>
            </View>
            <Text className="block text-xl font-bold text-on-surface leading-tight">{note.title}</Text>
            <View className="flex items-center gap-2 mt-2">
              <Clock size={12} color="#9498AC" />
              <Text className="block text-xs text-on-surface-variant tabular-nums">{note.created_at?.replace('T', ' ').slice(0, 16)}</Text>
            </View>
          </View>
        </View>

        {/* 文档：H5 用 innerHTML 渲染 HTML（保留格式 + 长按选中），小程序 fallback 纯文本 */}
        {isMdDoc && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="flex items-center gap-2 mb-3">
                <FileText size={14} color="#5B5E72" />
                <Text className="block text-sm font-semibold text-on-surface">文档内容</Text>
              </View>
              {IS_H5_ENV ? (
                <View
                  ref={mdContentRef as any}
                  className="md-content block text-sm text-on-surface leading-relaxed"
                  style={{ wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' as any }}
                />
              ) : (
                <Text
                  className="block text-sm text-on-surface leading-relaxed whitespace-pre-wrap"
                  style={{ wordBreak: 'break-word' }}
                >
                  {/* 剥 <p>/<br> 等 HTML 标签 + 实体还原,纯文本展示 */}
                  {String(note!.content)
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')}
                </Text>
              )}
            </View>
          </View>
        )}

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

        {/* 观点：详细观点 */}
        {!isDoc && note.content && (
          <View className="px-4 pt-3">
            <View className="rounded-2xl p-4 bg-white bg-opacity-72 border border-white border-opacity-85">
              <View className="flex items-center gap-2 mb-2">
                <FileText size={14} color="#5B5E72" />
                <Text className="block text-sm font-semibold text-on-surface">详细观点</Text>
              </View>
              <Text className="block text-sm text-on-surface leading-relaxed whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{note.content}</Text>
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
    </View>
  )
}
