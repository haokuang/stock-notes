import assert from 'node:assert/strict'
import test from 'node:test'
import { NotesService } from './notes.service'

/**
 * 通过 mock Drizzle + Pool 单元测试 NotesService 的渲染/重定位/创建/删除逻辑。
 * 数据库集成行为在 highlight-persistence.test.ts 中覆盖。
 */

function makeService(opts: {
  note: any
  pool?: { connect: () => Promise<any> }
  db?: any
} = { note: null }) {
  const db = opts.db ?? {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: async () => opts.note ? [opts.note] : [],
          }),
        }),
      }),
    }),
  }
  let pool = opts.pool
  if (!pool) {
    pool = {
      connect: async () => {
        throw new Error('pool.connect should not be called in this test')
      },
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NotesService(db, pool as any)
}

test('regular note content is rendered as markdown and returned with hash + highlights', async () => {
  const note = {
    id: 'n1',
    user_id: 'u1',
    stock_id: 's1',
    stock_code: '600000',
    stock_name: 'Test',
    type: 'note',
    title: 't',
    content: '# Hello **world**',
    doc_md: null,
    direction: 'neutral',
    entry_price: null,
    target_price: null,
    stop_loss: null,
    tags: [],
    event: null,
    source: null,
    images: [],
    ai_summary: null,
    created_at: '2026-06-15',
    updated_at: '2026-06-15',
  }

  const reconcileCalls: any[] = []
  const pool = {
    connect: async () => {
      let released = false
      return {
        query: async (sql: string, params: any[]) => {
          reconcileCalls.push({ sql, params })
          if (sql.startsWith('SELECT')) {
            return { rows: [], rowCount: 0 }
          }
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [], rowCount: 0 }
          }
          return { rows: [], rowCount: 0 }
        },
        release: () => {
          released = true
        },
        _released: () => released,
      }
    },
  }

  const svc = makeService({ note, pool })
  const out = await svc.getById('u1', 'n1')
  assert.match(out.rendered_content, /<h1>Hello <strong>world<\/strong><\/h1>/)
  assert.equal(out.content_hash.length, 64)
  assert.deepEqual(out.highlights, [])
  // reconcile 跑了 1 次
  assert.equal(reconcileCalls.length, 1)
  assert.match(reconcileCalls[0].sql, /FROM note_highlights/)
})

test('doc content uses doc_md as the markdown source', async () => {
  const note = {
    id: 'd1',
    user_id: 'u1',
    stock_id: 's1',
    stock_code: '600000',
    stock_name: 'Test',
    type: 'doc',
    title: 'd',
    content: '<p>raw html</p>',  // 不应该被使用
    doc_md: '# Doc Title\n\n- item',
    direction: null,
    entry_price: null,
    target_price: null,
    stop_loss: null,
    tags: [],
    event: null,
    source: null,
    images: [],
    ai_summary: null,
    created_at: '2026-06-15',
    updated_at: '2026-06-15',
  }
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (sql.startsWith('SELECT')) return { rows: [], rowCount: 0 }
        return { rows: [], rowCount: 0 }
      },
      release: () => {},
    }),
  }
  const svc = makeService({ note, pool })
  const out = await svc.getById('u1', 'd1')
  assert.match(out.rendered_content, /<h1>Doc Title<\/h1>/)
  assert.match(out.rendered_content, /<li>item<\/li>/)
  assert.doesNotMatch(out.rendered_content, /raw html/)
})

test('createHighlight rejects when source hash does not match', async () => {
  const note = {
    id: 'n1',
    user_id: 'u1',
    stock_id: 's1',
    stock_code: '600000',
    stock_name: 'Test',
    type: 'note',
    title: 't',
    content: 'hello world',
    doc_md: null,
    direction: 'neutral',
    entry_price: null,
    target_price: null,
    stop_loss: null,
    tags: [],
    event: null,
    source: null,
    images: [],
    ai_summary: null,
    created_at: '2026-06-15',
    updated_at: '2026-06-15',
  }
  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (sql.startsWith('SELECT')) return { rows: [], rowCount: 0 }
        return { rows: [], rowCount: 0 }
      },
      release: () => {},
    }),
  }
  const svc = makeService({ note, pool })
  await assert.rejects(
    svc.createHighlight('u1', 'n1', {
      selected_text: 'hello',
      prefix_text: '',
      suffix_text: '',
      start_offset: 0,
      end_offset: 5,
      source_hash: 'WRONG_HASH',
    }),
    /正文已更新/,
  )
})

test('createHighlight validates selected text at the submitted offsets', async () => {
  const note = {
    id: 'n1',
    user_id: 'u1',
    stock_id: 's1',
    stock_code: '600000',
    stock_name: 'Test',
    type: 'note',
    title: 't',
    content: 'hello world',
    doc_md: null,
    direction: 'neutral',
    entry_price: null,
    target_price: null,
    stop_loss: null,
    tags: [],
    event: null,
    source: null,
    images: [],
    ai_summary: null,
    created_at: '2026-06-15',
    updated_at: '2026-06-15',
  }
  // 先算出真实 hash
  const svcProbe = makeService({
    note,
    pool: { connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }) },
  })
  const probe = await svcProbe.getById('u1', 'n1')
  const realHash = probe.content_hash

  const pool = {
    connect: async () => ({
      query: async (sql: string) => {
        if (sql.startsWith('SELECT')) return { rows: [], rowCount: 0 }
        return { rows: [], rowCount: 0 }
      },
      release: () => {},
    }),
  }
  const svc = makeService({ note, pool })
  await assert.rejects(
    svc.createHighlight('u1', 'n1', {
      selected_text: 'WORLD',  // 大小写不对
      prefix_text: '',
      suffix_text: '',
      start_offset: 6,
      end_offset: 11,
      source_hash: realHash,
    }),
    /选区与正文不一致/,
  )
})

test('preserves a highlight after text is inserted before it', async () => {
  const { resolveHighlightAnchor } = await import('./highlight-anchor')
  const oldText = 'say hello world today'
  const newText = 'say HELLO there. then say hello world today'
  const anchor = {
    selectedText: 'hello world',
    prefixText: 'say ',
    suffixText: ' today',
    startOffset: 4,
    endOffset: 15,
    sourceHash: 'old',
  }
  const old = resolveHighlightAnchor(oldText, anchor, 'old')
  const relocated = resolveHighlightAnchor(newText, anchor, 'new')
  assert.ok(old)
  assert.ok(relocated)
  // 插入前缀后位置平移
  assert.equal(relocated.startOffset, 26)
  assert.equal(relocated.endOffset, 37)
})

test('deletes a highlight when its quote no longer exists', async () => {
  const { resolveHighlightAnchor } = await import('./highlight-anchor')
  const oldText = 'say hello world today'
  const newText = 'totally different content now'
  const anchor = {
    selectedText: 'hello world',
    prefixText: 'say ',
    suffixText: ' today',
    startOffset: 4,
    endOffset: 15,
    sourceHash: 'old',
  }
  const old = resolveHighlightAnchor(oldText, anchor, 'old')
  const none = resolveHighlightAnchor(newText, anchor, 'new')
  assert.ok(old)
  assert.equal(none, null)
})

test('deletes a highlight when repeated candidates are ambiguous', async () => {
  const { resolveHighlightAnchor } = await import('./highlight-anchor')
  const text = 'alpha hello world beta. gamma hello world delta.'
  const anchor = {
    selectedText: 'hello world',
    prefixText: '',
    suffixText: '',
    startOffset: 6,
    endOffset: 17,
    sourceHash: 'old',
  }
  assert.equal(resolveHighlightAnchor(text, anchor, 'new'), null)
})
