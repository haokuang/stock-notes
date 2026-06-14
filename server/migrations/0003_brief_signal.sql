-- ============================================================
-- 0003 · 每日简评结构化输出 + 3 色信号缓存
-- 新表:stock_briefs(每天每只股票 1 条最新信号)
-- ============================================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS stock_briefs (
  id                  VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id            VARCHAR(36) NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  trade_date          VARCHAR(10) NOT NULL,  -- YYYYMMDD
  signal              VARCHAR(10) NOT NULL,  -- 'green' | 'yellow' | 'red'
  technical_analysis  TEXT NOT NULL DEFAULT '',
  logic_judgment      TEXT NOT NULL DEFAULT '',
  action              VARCHAR(10) NOT NULL,  -- 'hold' | 'review' | 'sell'
  sell_reasons        JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_note_ids   UUID[] NOT NULL DEFAULT '{}'::uuid[],
  price_at_brief      NUMERIC(12,2),  -- 生成简评时的最新价
  stop_loss_triggered BOOLEAN NOT NULL DEFAULT FALSE,  -- 标记是否被止损逻辑强制覆盖
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 唯一索引:每只股票每天只有 1 条 brief(upsert 友好)
CREATE UNIQUE INDEX IF NOT EXISTS stock_briefs_stock_date_uq
  ON stock_briefs(stock_id, trade_date);

-- 3. 通用查询索引
CREATE INDEX IF NOT EXISTS stock_briefs_user_id_idx   ON stock_briefs(user_id);
CREATE INDEX IF NOT EXISTS stock_briefs_signal_idx    ON stock_briefs(signal);
CREATE INDEX IF NOT EXISTS stock_briefs_created_at_idx ON stock_briefs(created_at);

-- 4. CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_briefs_signal_check') THEN
    ALTER TABLE stock_briefs
      ADD CONSTRAINT stock_briefs_signal_check
      CHECK (signal IN ('green', 'yellow', 'red'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_briefs_action_check') THEN
    ALTER TABLE stock_briefs
      ADD CONSTRAINT stock_briefs_action_check
      CHECK (action IN ('hold', 'review', 'sell'));
  END IF;
END $$;

-- 5. RLS
ALTER TABLE stock_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_briefs_select_own" ON stock_briefs;
DROP POLICY IF EXISTS "stock_briefs_insert_own" ON stock_briefs;
DROP POLICY IF EXISTS "stock_briefs_update_own" ON stock_briefs;
DROP POLICY IF EXISTS "stock_briefs_delete_own" ON stock_briefs;
CREATE POLICY "stock_briefs_select_own" ON stock_briefs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "stock_briefs_insert_own" ON stock_briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_briefs_update_own" ON stock_briefs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_briefs_delete_own" ON stock_briefs FOR DELETE
  USING (auth.uid() = user_id);

-- 6. updated_at 触发器(复用 0001 的 set_updated_at)
DROP TRIGGER IF EXISTS stock_briefs_set_updated_at ON stock_briefs;
CREATE TRIGGER stock_briefs_set_updated_at BEFORE UPDATE ON stock_briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
