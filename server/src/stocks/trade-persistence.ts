import type { PoolClient } from 'pg'

interface TradeStockRow {
  id: string
  code: string
  name: string
  status: 'watching' | 'holding'
  current_price: string | null
  entry_price: string | null
}

export type TradeStateErrorCode = 'not_found' | 'already_holding' | 'not_holding'

export class TradeStateError extends Error {
  constructor(readonly code: TradeStateErrorCode) {
    super(code)
  }
}

interface BuyTransactionInput {
  userId: string
  stockId: string
  entryPrice: number
  lossRate: number
  buyReason: string
}

interface SellTransactionInput {
  userId: string
  stockId: string
  exitReason?: string
}

export async function buyStockTransaction(
  client: PoolClient,
  input: BuyTransactionInput,
) {
  await client.query('BEGIN')
  try {
    const stock = await lockStock(client, input.userId, input.stockId)
    if (!stock) throw new TradeStateError('not_found')
    if (stock.status === 'holding') throw new TradeStateError('already_holding')

    const enteredAt = new Date()
    const stopLossPrice = Number(
      ((input.entryPrice * (100 - input.lossRate)) / 100).toFixed(2),
    )
    await client.query(
      `UPDATE stocks
       SET status = 'holding',
           entry_price = $1,
           loss_rate = $2,
           entered_at = $3,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [input.entryPrice, input.lossRate, enteredAt, input.stockId, input.userId],
    )

    const noteResult = await client.query<{ id: string }>(
      `INSERT INTO notes
        (user_id, stock_id, stock_code, stock_name, type, title, content, direction,
         entry_price, target_price, stop_loss, tags, event, source, images, ai_summary)
       VALUES ($1, $2, $3, $4, 'note', $5, $6, 'bull',
         $7, NULL, $8, ARRAY['buy']::text[], NULL, 'manual', '[]'::jsonb, NULL)
       RETURNING id`,
      [
        input.userId,
        stock.id,
        stock.code,
        stock.name,
        `买入:${stock.name}(${stock.code}) @ ¥${input.entryPrice}`,
        input.buyReason,
        input.entryPrice,
        stopLossPrice,
      ],
    )

    await client.query('COMMIT')
    return {
      stock_id: stock.id,
      status: 'holding' as const,
      entry_price: input.entryPrice,
      loss_rate: input.lossRate,
      stop_loss_price: stopLossPrice,
      entered_at: enteredAt.toISOString(),
      buy_note_id: noteResult.rows[0]?.id ?? null,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function sellStockTransaction(
  client: PoolClient,
  input: SellTransactionInput,
) {
  await client.query('BEGIN')
  try {
    const stock = await lockStock(client, input.userId, input.stockId)
    if (!stock) throw new TradeStateError('not_found')
    if (stock.status !== 'holding') throw new TradeStateError('not_holding')

    const currentPrice = Number(stock.current_price ?? 0)
    const entryPrice = Number(stock.entry_price ?? 0)
    const actualReturnPct = entryPrice > 0
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : 0
    await client.query(
      `UPDATE stocks
       SET status = 'watching',
           entry_price = NULL,
           loss_rate = NULL,
           entered_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [input.stockId, input.userId],
    )

    const exitReason = input.exitReason?.trim()
      || `手动卖出,实际收益率 ${actualReturnPct.toFixed(2)}%`
    const noteResult = await client.query<{ id: string }>(
      `INSERT INTO notes
        (user_id, stock_id, stock_code, stock_name, type, title, content, direction,
         entry_price, target_price, stop_loss, tags, event, source, images, ai_summary)
       VALUES ($1, $2, $3, $4, 'note', $5, $6, 'bear',
         $7, NULL, NULL, ARRAY['sell', 'exit']::text[], NULL, 'manual', '[]'::jsonb, NULL)
       RETURNING id`,
      [
        input.userId,
        stock.id,
        stock.code,
        stock.name,
        `卖出:${stock.name}(${stock.code}) @ ¥${currentPrice.toFixed(2)}`,
        exitReason,
        stock.entry_price,
      ],
    )

    await client.query('COMMIT')
    return {
      stock_id: stock.id,
      status: 'watching' as const,
      actual_return_pct: Number(actualReturnPct.toFixed(2)),
      sell_note_id: noteResult.rows[0]?.id ?? null,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function lockStock(
  client: PoolClient,
  userId: string,
  stockId: string,
): Promise<TradeStockRow | null> {
  const result = await client.query<TradeStockRow>(
    `SELECT id, code, name, status, current_price, entry_price
     FROM stocks
     WHERE id = $1 AND user_id = $2
     FOR UPDATE`,
    [stockId, userId],
  )
  return result.rows[0] ?? null
}
