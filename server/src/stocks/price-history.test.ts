import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'dotenv'
import { Pool } from 'pg'
import type { DailyQuote } from '../tushare/tushare.service'
import { createDatabasePoolConfig } from '../storage/database/connection-config'
import { ensurePriceHistory } from './price-history'

config({ path: '.env.local' })

function createTestPool(): Pool {
  return new Pool(
    createDatabasePoolConfig({
      ...process.env,
      DB_CONNECTION_PROFILE: 'pooler-session',
    }),
  )
}

test('reads 60 existing trading days without calling Tushare', async () => {
  const pool = createTestPool()
  const client = await pool.connect()
  try {
    await createPriceTable(client)
    await seedPrices(client, 60)
    let fetchCount = 0

    const result = await ensurePriceHistory(client, {
      userId: '11111111-1111-4111-8111-111111111111',
      stockId: 'stock-1',
      tsCode: '600519.SH',
      fetchQuotes: async () => {
        fetchCount++
        return []
      },
    })

    assert.equal(fetchCount, 0)
    assert.equal(result.backfilled, false)
    assert.equal(result.sampleSize, 60)
    assert.equal(result.history.length, 60)
  } finally {
    client.release()
    await pool.end()
  }
})

test('backfills about 120 natural days and then rereads the latest 60 database rows', async () => {
  const pool = createTestPool()
  const client = await pool.connect()
  try {
    await createPriceTable(client)
    await seedPrices(client, 2)
    const calls: Array<{ tsCode: string; days: number }> = []

    const result = await ensurePriceHistory(client, {
      userId: '11111111-1111-4111-8111-111111111111',
      stockId: 'stock-1',
      tsCode: '600519.SH',
      fetchQuotes: async (tsCode, days) => {
        calls.push({ tsCode, days })
        return makeQuotes(65)
      },
    })

    assert.deepEqual(calls, [{ tsCode: '600519.SH', days: 120 }])
    assert.equal(result.backfilled, true)
    assert.equal(result.sampleSize, 60)
    assert.equal(result.history.length, 60)
    assert.equal(result.history[0].trade_date, '20260306')
  } finally {
    client.release()
    await pool.end()
  }
})

async function createPriceTable(client: import('pg').PoolClient) {
  await client.query(`
    CREATE TEMP TABLE stock_prices (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      stock_id varchar(36) NOT NULL,
      trade_date varchar(10) NOT NULL,
      open_price numeric(12,2),
      high_price numeric(12,2),
      low_price numeric(12,2),
      close_price numeric(12,2),
      pre_close numeric(12,2),
      change_amount numeric(12,2),
      change_percent numeric(6,2),
      volume numeric(18,0),
      amount numeric(18,2),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, stock_id, trade_date)
    )
  `)
}

async function seedPrices(client: import('pg').PoolClient, count: number) {
  const quotes = makeQuotes(count)
  for (const quote of quotes) {
    await client.query(
      `INSERT INTO stock_prices
        (user_id, stock_id, trade_date, close_price, volume)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        '11111111-1111-4111-8111-111111111111',
        'stock-1',
        quote.trade_date,
        quote.close,
        quote.vol,
      ],
    )
  }
}

function makeQuotes(count: number): DailyQuote[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index))
    const tradeDate = date.toISOString().slice(0, 10).replace(/-/g, '')
    const close = 100 + index
    return {
      ts_code: '600519.SH',
      trade_date: tradeDate,
      open: close - 1,
      high: close + 1,
      low: close - 2,
      close,
      pre_close: close - 1,
      change: 1,
      pct_chg: 1,
      vol: 1000 + index,
      amount: 100000 + index,
    }
  })
}
