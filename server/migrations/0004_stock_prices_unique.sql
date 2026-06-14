-- ============================================================
-- 0004 · stock_prices 唯一约束(防止同日重复)
-- 补 0001 漏掉的 ON CONFLICT target
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS stock_prices_user_stock_date_uq
  ON stock_prices (user_id, stock_id, trade_date);
