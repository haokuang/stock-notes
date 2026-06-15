import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'dotenv'
import { Pool, type PoolClient } from 'pg'
import {
  createNoteHighlight,
  deleteNoteHighlight,
  listNoteHighlights,
  reconcileNoteHighlights,
} from './highlight-persistence'

config({ path: '.env.local' })

test('creates and reads a highlight owned by the current user', async () => {
  assert.ok(process.env.SUPABASE_DB_URL, 'SUPABASE_DB_URL is required')
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userId = '11111111-1111-4111-8111-111111111111'
    const noteId = await createNote(client, userId)
    const created = await createNoteHighlight(client, {
      userId,
      noteId,
      selectedText: 'hello world',
      prefixText: 'say ',
      suffixText: ' today',
      startOffset: 4,
      endOffset: 15,
      sourceHash: 'h-1',
    })
    assert.equal(created.user_id, userId)
    assert.equal(created.selected_text, 'hello world')

    const listed = await listNoteHighlights(client, userId, noteId)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, created.id)
  } finally {
    client.release()
    await pool.end()
  }
})

test('does not read or delete another user highlight', async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userA = '11111111-1111-4111-8111-111111111111'
    const userB = '22222222-2222-4222-8222-222222222222'
    const noteId = await createNote(client, userA)
    const created = await createNoteHighlight(client, {
      userId: userA,
      noteId,
      selectedText: 'mine',
      prefixText: '',
      suffixText: '',
      startOffset: 0,
      endOffset: 4,
      sourceHash: 'h-1',
    })

    const listed = await listNoteHighlights(client, userB, noteId)
    assert.equal(listed.length, 0, 'userB should not see userA highlight')

    const deleted = await deleteNoteHighlight(
      client,
      userB,
      noteId,
      created.id,
    )
    assert.equal(deleted, false)

    const stillThere = await listNoteHighlights(client, userA, noteId)
    assert.equal(stillThere.length, 1, 'userA highlight remains')
  } finally {
    client.release()
    await pool.end()
  }
})

test('rejects an overlapping highlight for the same source hash', async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userId = '11111111-1111-4111-8111-111111111111'
    const noteId = await createNote(client, userId)
    await createNoteHighlight(client, {
      userId,
      noteId,
      selectedText: 'hello world',
      prefixText: '',
      suffixText: '',
      startOffset: 0,
      endOffset: 11,
      sourceHash: 'h-1',
    })
    await assert.rejects(
      createNoteHighlight(client, {
        userId,
        noteId,
        selectedText: 'lo wo',
        prefixText: '',
        suffixText: '',
        startOffset: 3,
        endOffset: 8,
        sourceHash: 'h-1',
      }),
      /overlap|unique|conflict/i,
    )
  } finally {
    client.release()
    await pool.end()
  }
})

test('updates relocated anchors and removes invalid anchors atomically', async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userId = '11111111-1111-4111-8111-111111111111'
    const noteId = await createNote(client, userId)
    // 'AAA hello world'  偏移 4-15
    const h1 = await createNoteHighlight(client, {
      userId,
      noteId,
      selectedText: 'hello world',
      prefixText: 'AAA ',
      suffixText: '',
      startOffset: 4,
      endOffset: 15,
      sourceHash: 'old',
    })
    // 'hello world! (重复但上下文不同)' - 后面再追加一个,会撞上下文歧义
    const h2 = await createNoteHighlight(client, {
      userId,
      noteId,
      selectedText: 'nothing',
      prefixText: '',
      suffixText: '',
      startOffset: 0,
      endOffset: 7,
      sourceHash: 'old',
    })

    // 新文本: 'PREPENDED-AAA hello world!AAA hello world' - h1 应该仍可解析, h2 应该被删除(文本不再存在)
    const newText = 'PREPENDED-AAA hello world!AAA hello world'
    const newHash = 'new'
    const valid = await reconcileNoteHighlights(client, {
      userId,
      noteId,
      text: newText,
      currentHash: newHash,
    })
    assert.equal(valid.length, 1, 'h1 keeps, h2 removed')
    assert.equal(valid[0].id, h1.id)
    assert.equal(valid[0].source_hash, newHash)
    // h1 起点应为 11 (PREPENDED- 长度)
    assert.equal(valid[0].start_offset, 11)

    // h2 已经被原子删除
    const remaining = await listNoteHighlights(client, userId, noteId)
    assert.equal(remaining.length, 1)
  } finally {
    client.release()
    await pool.end()
  }
})

test('deleting a note cascades to its highlights', async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userId = '11111111-1111-4111-8111-111111111111'
    const noteId = await createNote(client, userId)
    await createNoteHighlight(client, {
      userId,
      noteId,
      selectedText: 'x',
      prefixText: '',
      suffixText: '',
      startOffset: 0,
      endOffset: 1,
      sourceHash: 'h',
    })
    await client.query('DELETE FROM notes WHERE id = $1', [noteId])
    const remaining = await listNoteHighlights(client, userId, noteId)
    assert.equal(remaining.length, 0)
  } finally {
    client.release()
    await pool.end()
  }
})

// ============== helpers ==============

async function setupSchema(client: PoolClient) {
  await client.query(`
    CREATE TEMP TABLE IF NOT EXISTS notes (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      stock_id varchar(36) NOT NULL,
      stock_code varchar(20) NOT NULL,
      stock_name varchar(100) NOT NULL,
      type varchar(10) NOT NULL,
      title varchar(200) NOT NULL,
      content text NOT NULL DEFAULT '',
      doc_md text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    CREATE TEMP TABLE IF NOT EXISTS note_highlights (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      note_id varchar(36) NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      selected_text text NOT NULL CHECK (length(btrim(selected_text)) > 0),
      prefix_text text NOT NULL DEFAULT '',
      suffix_text text NOT NULL DEFAULT '',
      start_offset integer NOT NULL CHECK (start_offset >= 0),
      end_offset integer NOT NULL CHECK (end_offset > start_offset),
      source_hash varchar(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, note_id, source_hash, start_offset, end_offset)
    )
  `)
}

async function createNote(client: PoolClient, userId: string): Promise<string> {
  const stockId = `s-${Math.random().toString(36).slice(2, 10)}`
  await client.query(
    `INSERT INTO notes (user_id, stock_id, stock_code, stock_name, type, title)
     VALUES ($1, $2, '600000', 'TestStock', 'note', 't')`,
    [userId, stockId],
  )
  const r = await client.query<{ id: string }>(
    'SELECT id FROM notes WHERE user_id = $1 AND stock_id = $2 ORDER BY created_at DESC LIMIT 1',
    [userId, stockId],
  )
  return r.rows[0].id
}
