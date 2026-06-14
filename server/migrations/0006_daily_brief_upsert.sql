-- ============================================================
-- 0006 · 每日简评幂等 upsert
-- - stock_briefs 唯一键补 user_id
-- - notes 增加稳定来源键，避免重复创建自动简评文档
-- ============================================================

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- 给现有自动简评补稳定来源键。若历史上已有重复，只保留最早一条参与后续 upsert。
WITH ranked_auto_briefs AS (
  SELECT
    id,
    stock_id || ':' || substring(title FROM '([0-9]{8})$') AS source_ref,
    row_number() OVER (
      PARTITION BY user_id, stock_id, substring(title FROM '([0-9]{8})$')
      ORDER BY created_at, id
    ) AS row_number
  FROM notes
  WHERE source = 'auto-brief'
    AND title ~ '[0-9]{8}$'
)
UPDATE notes
SET source_ref = ranked_auto_briefs.source_ref
FROM ranked_auto_briefs
WHERE notes.id = ranked_auto_briefs.id
  AND ranked_auto_briefs.row_number = 1
  AND notes.source_ref IS NULL;

DROP INDEX IF EXISTS stock_briefs_stock_date_uq;

CREATE UNIQUE INDEX IF NOT EXISTS stock_briefs_user_stock_date_uq
  ON stock_briefs(user_id, stock_id, trade_date);

CREATE UNIQUE INDEX IF NOT EXISTS notes_user_source_ref_uq
  ON notes(user_id, source, source_ref);
