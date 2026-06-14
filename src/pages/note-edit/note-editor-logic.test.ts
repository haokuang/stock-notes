import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNoteMutation,
  buildNotePayload,
  parseNoteEditorRoute,
  resolveNoteTitle,
} from './note-editor-logic'

test('parses edit route and requested document type', () => {
  assert.deepEqual(
    parseNoteEditorRoute({
      note_id: 'note-1',
      stock_id: 'stock-1',
      stock_name: encodeURIComponent('贵州茅台'),
      type: 'doc',
    }),
    {
      noteId: 'note-1',
      stockId: 'stock-1',
      stockName: '贵州茅台',
      requestedType: 'doc',
      isEditing: true,
    },
  )
})

test('defaults an invalid route type to note', () => {
  assert.equal(parseNoteEditorRoute({ type: 'other' }).requestedType, 'note')
})

test('uses an entered note title without requesting AI', () => {
  assert.deepEqual(
    resolveNoteTitle({
      type: 'note',
      title: '已有标题',
      content: '正文',
    }),
    {
      ok: true,
      title: '已有标题',
      shouldSummarize: false,
    },
  )
})

test('requests AI for an untitled note with enough content and prepares a fallback', () => {
  const content = '这是一段足够长的观点正文，用来测试自动生成标题的完整流程，并确保超过三十个汉字。'
  assert.deepEqual(
    resolveNoteTitle({
      type: 'note',
      title: '',
      content,
    }),
    {
      ok: true,
      title: `${content.slice(0, 30)}...`,
      shouldSummarize: true,
    },
  )
})

test('uses the local fallback when AI returns an empty title', () => {
  const content = '这是一段足够长的观点正文，用来测试人工智能返回空标题时的降级。'
  const result = resolveNoteTitle({
    type: 'note',
    title: '',
    content,
    aiTitle: '',
  })
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.shouldSummarize, false)
  assert.equal(result.ok && result.title, `${content.slice(0, 30)}...`)
})

test('rejects an untitled note whose content is too short', () => {
  assert.deepEqual(
    resolveNoteTitle({
      type: 'note',
      title: '',
      content: '内容太短',
    }),
    {
      ok: false,
      message: '标题留空时，请至少填写 10 个字的详细观点',
    },
  )
})

test('builds create and update request targets', () => {
  assert.deepEqual(buildNoteMutation(''), {
    url: '/api/notes',
    method: 'POST',
  })
  assert.deepEqual(buildNoteMutation('note-1'), {
    url: '/api/notes/note-1',
    method: 'PUT',
  })
})

test('includes stock and type only when creating', () => {
  const fields = {
    stockId: 'stock-1',
    type: 'note' as const,
    title: '标题',
    content: '正文',
    direction: 'bull' as const,
    entryPrice: 10,
    targetPrice: null,
    stopLoss: 8,
    images: ['tos-image-url'],
  }

  assert.deepEqual(buildNotePayload(fields, false), {
    stock_id: 'stock-1',
    type: 'note',
    title: '标题',
    content: '正文',
    direction: 'bull',
    entry_price: 10,
    target_price: null,
    stop_loss: 8,
    tags: [],
    images: ['tos-image-url'],
  })

  assert.deepEqual(buildNotePayload(fields, true), {
    title: '标题',
    content: '正文',
    direction: 'bull',
    entry_price: 10,
    target_price: null,
    stop_loss: 8,
    tags: [],
    images: ['tos-image-url'],
  })
})

test('builds a document update without immutable fields', () => {
  assert.deepEqual(
    buildNotePayload(
      {
        stockId: 'stock-1',
        type: 'doc',
        title: '文档标题',
        docMd: '# 文档',
      },
      true,
    ),
    {
      title: '文档标题',
      doc_md: '# 文档',
      content: '',
    },
  )
})
