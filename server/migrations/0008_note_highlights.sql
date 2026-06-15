-- ============================================================
-- 0008 · note_highlights 笔记高亮持久化
-- 设计见 docs/superpowers/specs/2026-06-15-note-markdown-highlight-design.md
-- ============================================================

CREATE TABLE IF NOT EXISTS note_highlights (
  id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id       VARCHAR(36) NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  selected_text TEXT NOT NULL CHECK (length(btrim(selected_text)) > 0),
  prefix_text   TEXT NOT NULL DEFAULT '',
  suffix_text   TEXT NOT NULL DEFAULT '',
  start_offset  INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset    INTEGER NOT NULL CHECK (end_offset > start_offset),
  source_hash   VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS note_highlights_user_note_idx
  ON note_highlights(user_id, note_id, start_offset);

CREATE UNIQUE INDEX IF NOT EXISTS note_highlights_exact_uq
  ON note_highlights(user_id, note_id, source_hash, start_offset, end_offset);

ALTER TABLE note_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_highlights_select_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_insert_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_update_own" ON note_highlights;
DROP POLICY IF EXISTS "note_highlights_delete_own" ON note_highlights;

CREATE POLICY "note_highlights_select_own"
  ON note_highlights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "note_highlights_insert_own"
  ON note_highlights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_highlights_update_own"
  ON note_highlights FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "note_highlights_delete_own"
  ON note_highlights FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS note_highlights_set_updated_at ON note_highlights;
CREATE TRIGGER note_highlights_set_updated_at
  BEFORE UPDATE ON note_highlights
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
