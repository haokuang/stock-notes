import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0008_note_highlights.sql'),
  'utf8',
)

test('creates user-owned note highlights with RLS and anchor constraints', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_highlights/)
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  assert.match(migration, /REFERENCES notes\(id\) ON DELETE CASCADE/)
  assert.match(migration, /end_offset > start_offset/)
  assert.match(migration, /ALTER TABLE note_highlights ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /note_highlights_select_own/)
  assert.match(migration, /note_highlights_insert_own/)
  assert.match(migration, /note_highlights_update_own/)
  assert.match(migration, /note_highlights_delete_own/)
})
