export type NoteType = 'note' | 'doc'
export type NoteDirection = 'bull' | 'bear' | 'neutral'

export function formatResearchSubjectOption(subject: {
  name: string
  code: string
  subject_type: 'stock' | 'market'
}): string {
  return subject.subject_type === 'market'
    ? `${subject.name} · 市场研究`
    : `${subject.name} · ${subject.code}`
}

export interface NoteEditorRoute {
  noteId: string
  stockId: string
  stockName: string
  requestedType: NoteType
  isEditing: boolean
}

export interface NoteEditorFields {
  stockId: string
  type: NoteType
  title: string
  content?: string
  docMd?: string
  direction?: NoteDirection
  entryPrice?: number | null
  targetPrice?: number | null
  stopLoss?: number | null
  tags?: string[]
  images?: string[]
}

export type NoteTitleResolution =
  | {
      ok: true
      title: string
      shouldSummarize: boolean
    }
  | {
      ok: false
      message: string
    }

export function parseNoteEditorRoute(
  opts?: Record<string, string | undefined>,
): NoteEditorRoute {
  const noteId = opts?.note_id?.trim() ?? ''
  const requestedType: NoteType = opts?.type === 'doc' ? 'doc' : 'note'
  let stockName = ''
  if (opts?.stock_name) {
    try {
      stockName = decodeURIComponent(opts.stock_name)
    } catch {
      stockName = opts.stock_name
    }
  }

  return {
    noteId,
    stockId: opts?.stock_id?.trim() ?? '',
    stockName,
    requestedType,
    isEditing: Boolean(noteId),
  }
}

function createFallbackTitle(content: string): string {
  const trimmed = content.trim()
  return trimmed.slice(0, 30) + (trimmed.length > 30 ? '...' : '')
}

export function resolveNoteTitle(input: {
  type: NoteType
  title: string
  content: string
  aiTitle?: string
}): NoteTitleResolution {
  const title = input.title.trim()
  if (title) {
    return { ok: true, title, shouldSummarize: false }
  }

  if (input.type === 'doc') {
    return { ok: false, message: '请填写文档标题' }
  }

  const content = input.content.trim()
  if (content.length < 10) {
    return {
      ok: false,
      message: '标题留空时，请至少填写 10 个字的详细观点',
    }
  }

  const aiTitle = input.aiTitle?.trim()
  return {
    ok: true,
    title: aiTitle || createFallbackTitle(content),
    shouldSummarize: input.aiTitle === undefined,
  }
}

export function buildNoteMutation(noteId: string): {
  url: string
  method: 'POST' | 'PUT'
} {
  return noteId
    ? { url: `/api/notes/${noteId}`, method: 'PUT' }
    : { url: '/api/notes', method: 'POST' }
}

export function buildNotePayload(
  fields: NoteEditorFields,
  isEditing: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: fields.title,
  }

  if (!isEditing) {
    payload.stock_id = fields.stockId
    payload.type = fields.type
  }

  if (fields.type === 'doc') {
    payload.doc_md = fields.docMd ?? ''
    payload.content = ''
    return payload
  }

  payload.content = (fields.content ?? '').replace(/\r\n/g, '\n').trim()
  if (!isEditing) {
    payload.direction = fields.direction ?? 'neutral'
    payload.entry_price = fields.entryPrice ?? null
    payload.target_price = fields.targetPrice ?? null
    payload.stop_loss = fields.stopLoss ?? null
    payload.tags = fields.tags ?? []
    payload.images = fields.images ?? []
    return payload
  }

  if (fields.direction !== undefined) payload.direction = fields.direction
  if (fields.entryPrice !== undefined) payload.entry_price = fields.entryPrice
  if (fields.targetPrice !== undefined) payload.target_price = fields.targetPrice
  if (fields.stopLoss !== undefined) payload.stop_loss = fields.stopLoss
  if (fields.tags !== undefined) payload.tags = fields.tags
  if (fields.images !== undefined) payload.images = fields.images
  return payload
}
