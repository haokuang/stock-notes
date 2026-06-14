-- ============================================================
-- stock-notes · Supabase schema migration
-- Generated from server/src/storage/database/shared/schema.ts
-- Target: Supabase Postgres (auth.users + RLS)
-- ============================================================

-- 1. 必要扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- 2. 系统表(与 Drizzle schema 保持一致)
CREATE TABLE IF NOT EXISTS health_check (
  id          SERIAL PRIMARY KEY,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 自选股 stocks
CREATE TABLE IF NOT EXISTS stocks (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(100) NOT NULL,
  industry        VARCHAR(100),
  current_price   NUMERIC(12,2),
  change_amount   NUMERIC(12,2),
  change_percent  NUMERIC(6,2),
  price_date      VARCHAR(10),     -- YYYYMMDD
  open_price      NUMERIC(12,2),
  high_price      NUMERIC(12,2),
  low_price       NUMERIC(12,2),
  pre_close       NUMERIC(12,2),
  volume          NUMERIC(18,0),
  amount          NUMERIC(18,2),
  last_sync_at    TIMESTAMPTZ,
  note            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stocks_user_id_idx      ON stocks(user_id);
CREATE INDEX IF NOT EXISTS stocks_code_idx         ON stocks(code);
CREATE INDEX IF NOT EXISTS stocks_created_at_idx   ON stocks(created_at);
CREATE INDEX IF NOT EXISTS stocks_user_code_idx    ON stocks(user_id, code);

-- 4. 投资观点 notes
CREATE TABLE IF NOT EXISTS notes (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id        VARCHAR(36) NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  stock_code      VARCHAR(20)  NOT NULL,
  stock_name      VARCHAR(100) NOT NULL,
  type            VARCHAR(10)  NOT NULL DEFAULT 'note',  -- note / doc
  title           VARCHAR(200) NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  doc_md          TEXT,
  direction       VARCHAR(10) DEFAULT 'neutral',           -- bull / bear / neutral
  entry_price     NUMERIC(12,2),
  target_price    NUMERIC(12,2),
  stop_loss       NUMERIC(12,2),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  event           TEXT,
  source          TEXT,
  images          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notes_user_id_idx         ON notes(user_id);
CREATE INDEX IF NOT EXISTS notes_stock_id_idx        ON notes(stock_id);
CREATE INDEX IF NOT EXISTS notes_direction_idx       ON notes(direction);
CREATE INDEX IF NOT EXISTS notes_type_idx            ON notes(type);
CREATE INDEX IF NOT EXISTS notes_created_at_idx      ON notes(created_at);
CREATE INDEX IF NOT EXISTS notes_user_created_idx    ON notes(user_id, created_at DESC);

-- 5. 股票日线 stock_prices
CREATE TABLE IF NOT EXISTS stock_prices (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id        VARCHAR(36) NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  trade_date      VARCHAR(10) NOT NULL,  -- YYYYMMDD
  open_price      NUMERIC(12,2),
  high_price      NUMERIC(12,2),
  low_price       NUMERIC(12,2),
  close_price     NUMERIC(12,2),
  pre_close       NUMERIC(12,2),
  change_amount   NUMERIC(12,2),
  change_percent  NUMERIC(6,2),
  volume          NUMERIC(18,0),
  amount          NUMERIC(18,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stock_prices_user_id_idx         ON stock_prices(user_id);
CREATE INDEX IF NOT EXISTS stock_prices_stock_id_idx        ON stock_prices(stock_id);
CREATE INDEX IF NOT EXISTS stock_prices_trade_date_idx      ON stock_prices(trade_date);
CREATE INDEX IF NOT EXISTS stock_prices_user_stock_idx      ON stock_prices(user_id, stock_id, trade_date DESC);

-- 6. AI 报告 ai_reports
CREATE TABLE IF NOT EXISTS ai_reports (
  id              VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id        VARCHAR(36) REFERENCES stocks(id) ON DELETE SET NULL,
  stock_code      VARCHAR(20),
  stock_name      VARCHAR(100),
  type            VARCHAR(20) NOT NULL,    -- image_understand / cross_view
  title           VARCHAR(200) NOT NULL,
  content         TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / done / failed
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_reports_user_id_idx         ON ai_reports(user_id);
CREATE INDEX IF NOT EXISTS ai_reports_stock_id_idx        ON ai_reports(stock_id);
CREATE INDEX IF NOT EXISTS ai_reports_type_idx            ON ai_reports(type);
CREATE INDEX IF NOT EXISTS ai_reports_created_at_idx      ON ai_reports(created_at);

-- ============================================================
-- 7. 启用 RLS
-- ============================================================
ALTER TABLE stocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_prices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reports    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. RLS 策略 — 每个用户只能操作自己的数据
-- ============================================================

-- stocks
DROP POLICY IF EXISTS "stocks_select_own"  ON stocks;
DROP POLICY IF EXISTS "stocks_insert_own"  ON stocks;
DROP POLICY IF EXISTS "stocks_update_own"  ON stocks;
DROP POLICY IF EXISTS "stocks_delete_own"  ON stocks;
CREATE POLICY "stocks_select_own" ON stocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stocks_insert_own" ON stocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stocks_update_own" ON stocks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stocks_delete_own" ON stocks FOR DELETE USING (auth.uid() = user_id);

-- notes
DROP POLICY IF EXISTS "notes_select_own"  ON notes;
DROP POLICY IF EXISTS "notes_insert_own"  ON notes;
DROP POLICY IF EXISTS "notes_update_own"  ON notes;
DROP POLICY IF EXISTS "notes_delete_own"  ON notes;
CREATE POLICY "notes_select_own" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notes_insert_own" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_update_own" ON notes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notes_delete_own" ON notes FOR DELETE USING (auth.uid() = user_id);

-- stock_prices
DROP POLICY IF EXISTS "stock_prices_select_own"  ON stock_prices;
DROP POLICY IF EXISTS "stock_prices_insert_own"  ON stock_prices;
DROP POLICY IF EXISTS "stock_prices_update_own"  ON stock_prices;
DROP POLICY IF EXISTS "stock_prices_delete_own"  ON stock_prices;
CREATE POLICY "stock_prices_select_own" ON stock_prices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "stock_prices_insert_own" ON stock_prices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_prices_update_own" ON stock_prices FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "stock_prices_delete_own" ON stock_prices FOR DELETE USING (auth.uid() = user_id);

-- ai_reports
DROP POLICY IF EXISTS "ai_reports_select_own"  ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_insert_own"  ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_update_own"  ON ai_reports;
DROP POLICY IF EXISTS "ai_reports_delete_own"  ON ai_reports;
CREATE POLICY "ai_reports_select_own" ON ai_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_reports_insert_own" ON ai_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_reports_update_own" ON ai_reports FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_reports_delete_own" ON ai_reports FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 9. updated_at 自动维护
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stocks_set_updated_at ON stocks;
CREATE TRIGGER stocks_set_updated_at BEFORE UPDATE ON stocks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 10. 健康检查(可选,验证函数)
-- ============================================================
INSERT INTO health_check DEFAULT VALUES;
