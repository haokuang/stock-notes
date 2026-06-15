-- ============================================================
-- 0007 · Schema 一致性与并发唯一约束
-- - stocks: 同一用户不能重复添加同一股票
-- - stock_briefs.stop_loss_triggered: 统一为 boolean
-- ============================================================

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type
  INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'stock_briefs'
    AND column_name = 'stop_loss_triggered';

  IF current_type IS NOT NULL AND current_type <> 'boolean' THEN
    ALTER TABLE stock_briefs
      ALTER COLUMN stop_loss_triggered DROP DEFAULT;
    ALTER TABLE stock_briefs
      ALTER COLUMN stop_loss_triggered TYPE BOOLEAN
      USING lower(stop_loss_triggered::text) IN ('t', 'true', '1', 'yes');
    ALTER TABLE stock_briefs
      ALTER COLUMN stop_loss_triggered SET DEFAULT FALSE;
  END IF;
END
$$;

DROP INDEX IF EXISTS stocks_user_code_idx;

CREATE UNIQUE INDEX IF NOT EXISTS stocks_user_code_uq
  ON stocks(user_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS stock_prices_user_stock_date_uq
  ON stock_prices(user_id, stock_id, trade_date);
