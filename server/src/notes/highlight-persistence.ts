/**
 * 笔记高亮持久化与重定位
 * 文档见 docs/superpowers/specs/2026-06-15-note-markdown-highlight-design.md
 *
 * - 所有写入走 client.query() 绕开 Drizzle 已知 prepared-stmt bug(参考 daily-brief-persistence)
 * - reconcile 在同一事务内: 解析已有锚点 → 更新有效 / 删除失效,原子返回剩余 row
 */

import type { PoolClient } from 'pg'
import { resolveHighlightAnchor, type HighlightAnchor } from './highlight-anchor'

export interface StoredHighlight {
  id: string
  user_id: string
  note_id: string
  selected_text: string
  prefix_text: string
  suffix_text: string
  start_offset: number
  end_offset: number
  source_hash: string
}

export interface CreateHighlightInput {
  userId: string
  noteId: string
  selectedText: string
  prefixText: string
  suffixText: string
  startOffset: number
  endOffset: number
  sourceHash: string
}

export interface ReconcileHighlightsInput {
  userId: string
  noteId: string
  text: string
  currentHash: string
}

const SELECT_COLUMNS =
  'id, user_id, note_id, selected_text, prefix_text, suffix_text, start_offset, end_offset, source_hash'

export async function listNoteHighlights(
  client: PoolClient,
  userId: string,
  noteId: string,
): Promise<StoredHighlight[]> {
  const result = await client.query<StoredHighlight>(
    `SELECT ${SELECT_COLUMNS} FROM note_highlights
     WHERE user_id = $1 AND note_id = $2
     ORDER BY start_offset ASC`,
    [userId, noteId],
  )
  return result.rows
}

export async function createNoteHighlight(
  client: PoolClient,
  input: CreateHighlightInput,
): Promise<StoredHighlight> {
  if (input.endOffset <= input.startOffset) {
    throw new Error('end_offset must be greater than start_offset')
  }
  if (!input.selectedText.trim()) {
    throw new Error('selected_text must not be empty')
  }
  try {
    const result = await client.query<StoredHighlight>(
      `INSERT INTO note_highlights
         (user_id, note_id, selected_text, prefix_text, suffix_text,
          start_offset, end_offset, source_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.userId,
        input.noteId,
        input.selectedText,
        input.prefixText,
        input.suffixText,
        input.startOffset,
        input.endOffset,
        input.sourceHash,
      ],
    )
    return result.rows[0]
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '23505') {
      throw new Error('overlap: identical highlight already exists')
    }
    throw e
  }
}

export async function deleteNoteHighlight(
  client: PoolClient,
  userId: string,
  noteId: string,
  highlightId: string,
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM note_highlights
     WHERE id = $1 AND user_id = $2 AND note_id = $3`,
    [highlightId, userId, noteId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function reconcileNoteHighlights(
  client: PoolClient,
  input: ReconcileHighlightsInput,
): Promise<StoredHighlight[]> {
  const existing = await listNoteHighlights(
    client,
    input.userId,
    input.noteId,
  )
  if (existing.length === 0) return []

  const valid: StoredHighlight[] = []
  const invalidIds: string[] = []

  for (const row of existing) {
    const anchor: HighlightAnchor = {
      selectedText: row.selected_text,
      prefixText: row.prefix_text,
      suffixText: row.suffix_text,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      sourceHash: row.source_hash,
    }
    const resolved = resolveHighlightAnchor(input.text, anchor, input.currentHash)
    if (!resolved) {
      invalidIds.push(row.id)
      continue
    }
    valid.push({ ...row, ...resolved, source_hash: input.currentHash })
  }

  await client.query('BEGIN')
  try {
    if (valid.length > 0) {
      for (const v of valid) {
        await client.query(
          `UPDATE note_highlights
           SET start_offset = $1, end_offset = $2, source_hash = $3, updated_at = now()
           WHERE id = $4 AND user_id = $5 AND note_id = $6`,
          [v.start_offset, v.end_offset, v.source_hash, v.id, v.user_id, v.note_id],
        )
      }
    }
    if (invalidIds.length > 0) {
      await client.query(
        `DELETE FROM note_highlights
         WHERE user_id = $1 AND note_id = $2 AND id = ANY($3::varchar[])`,
        [input.userId, input.noteId, invalidIds],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }

  return valid
}
