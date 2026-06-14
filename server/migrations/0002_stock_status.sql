-- ============================================================
-- 0002 · 股票状态机字段
-- 新增:status / entry_price / loss_rate / entered_at
-- ============================================================

-- 1. 新增字段(IF NOT EXISTS 兼容已有数据)
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS status varchar(10) NOT NULL DEFAULT 'watching';
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS entry_price numeric(12, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS loss_rate numeric(5, 2);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS entered_at timestamptz;

-- 2. 索引(按 status 查 holding 股票更常用)
CREATE INDEX IF NOT EXISTS stocks_status_idx ON stocks(status);

-- 3. 状态值约束(CHECK 兜底,防止脏数据)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stocks_status_check'
  ) THEN
    ALTER TABLE stocks
      ADD CONSTRAINT stocks_status_check CHECK (status IN ('watching', 'holding'));
  END IF;
END $$;
