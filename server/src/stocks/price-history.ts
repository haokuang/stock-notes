import type { PoolClient } from 'pg'
import type { DailyQuote } from '../tushare/tushare.service'

export interface PriceHistoryRow {
  id: string
  user_id: string
  stock_id: string
  trade_date: string
  open_price: string | null
  high_price: string | null
  low_price: string | null
  close_price: string | null
  pre_close: string | null
  change_amount: string | null
  change_percent: string | null
  volume: string | null
  amount: string | null
  created_at: string
}

interface EnsurePriceHistoryInput {
  userId: string
  stockId: string
  tsCode: string
  minimumRows?: number
  lookbackDays?: number
  fetchQuotes: (tsCode: string, days: number) => Promise<DailyQuote[]>
}

export async function ensurePriceHistory(
  client: PoolClient,
  input: EnsurePriceHistoryInput,
): Promise<{
  history: PriceHistoryRow[]
  sampleSize: number
  backfilled: boolean
}> {
  const minimumRows = input.minimumRows ?? 60
  const lookbackDays = input.lookbackDays ?? 120
  let history = await readPriceHistory(
    client,
    input.userId,
    input.stockId,
    minimumRows,
  )
  if (history.length >= minimumRows) {
    return { history, sampleSize: history.length, backfilled: false }
  }

  const quotes = await input.fetchQuotes(input.tsCode, lookbackDays)
  if (quotes.length > 0) {
    await upsertPriceHistory(client, input.userId, input.stockId, quotes)
    history = await readPriceHistory(
      client,
      input.userId,
      input.stockId,
      minimumRows,
    )
  }
  return { history, sampleSize: history.length, backfilled: quotes.length > 0 }
}

async function readPriceHistory(
  client: PoolClient,
  userId: string,
  stockId: string,
  limit: number,
): Promise<PriceHistoryRow[]> {
  const result = await client.query<PriceHistoryRow>(
    `SELECT id, user_id, stock_id, trade_date, open_price, high_price, low_price,
       close_price, pre_close, change_amount, change_percent, volume, amount, created_at
     FROM stock_prices
     WHERE user_id = $1 AND stock_id = $2
     ORDER BY trade_date DESC
     LIMIT $3`,
    [userId, stockId, limit],
  )
  return result.rows
}

async function upsertPriceHistory(
  client: PoolClient,
  userId: string,
  stockId: string,
  quotes: DailyQuote[],
) {
  const validQuotes = quotes.filter((quote) => quote.trade_date)
  if (validQuotes.length === 0) return
  const values: unknown[] = []
  const placeholders = validQuotes.map((quote, rowIndex) => {
    const offset = rowIndex * 12
    values.push(
      userId,
      stockId,
      quote.trade_date,
      quote.open,
      quote.high,
      quote.low,
      quote.close,
      quote.pre_close,
      quote.change,
      quote.pct_chg,
      quote.vol != null ? Math.round(quote.vol) : null,
      quote.amount,
    )
    return `(${Array.from({ length: 12 }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`
  })

  await client.query('BEGIN')
  try {
    await client.query(
      `INSERT INTO stock_prices
        (user_id, stock_id, trade_date, open_price, high_price, low_price,
         close_price, pre_close, change_amount, change_percent, volume, amount)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (user_id, stock_id, trade_date)
       DO UPDATE SET
         open_price = EXCLUDED.open_price,
         high_price = EXCLUDED.high_price,
         low_price = EXCLUDED.low_price,
         close_price = EXCLUDED.close_price,
         pre_close = EXCLUDED.pre_close,
         change_amount = EXCLUDED.change_amount,
         change_percent = EXCLUDED.change_percent,
         volume = EXCLUDED.volume,
         amount = EXCLUDED.amount`,
      values,
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
