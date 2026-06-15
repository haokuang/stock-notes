import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'dotenv'
import { Pool } from 'pg'
import {
  buyStockTransaction,
  sellStockTransaction,
} from './trade-persistence'

config({ path: '.env.local' })

test('rolls back the stock state when the buy note insert fails', async () => {
  assert.ok(process.env.SUPABASE_DB_URL)
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await createTradeTables(client)
    await client.query(`
      INSERT INTO stocks (id, user_id, code, name, status, current_price)
      VALUES ('stock-1', '11111111-1111-4111-8111-111111111111', '600519', '贵州茅台', 'watching', 1500)
    `)

    await assert.rejects(
      buyStockTransaction(client, {
        userId: '11111111-1111-4111-8111-111111111111',
        stockId: 'stock-1',
        entryPrice: 1500,
        lossRate: 10,
        buyReason: 'force-note-failure',
      }),
      /notes_content_check/,
    )

    const state = await client.query('SELECT status, entry_price, loss_rate FROM stocks WHERE id = $1', ['stock-1'])
    assert.deepEqual(state.rows[0], { status: 'watching', entry_price: null, loss_rate: null })
  } finally {
    client.release()
    await pool.end()
  }
})

test('commits buy and sell state changes together with their notes', async () => {
  assert.ok(process.env.SUPABASE_DB_URL)
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })
  const client = await pool.connect()
  try {
    await createTradeTables(client)
    await client.query(`
      INSERT INTO stocks (id, user_id, code, name, status, current_price)
      VALUES ('stock-2', '22222222-2222-4222-8222-222222222222', '000001', '平安银行', 'watching', 12.50)
    `)

    const bought = await buyStockTransaction(client, {
      userId: '22222222-2222-4222-8222-222222222222',
      stockId: 'stock-2',
      entryPrice: 12,
      lossRate: 8,
      buyReason: '估值合理且基本面改善',
    })
    assert.equal(bought.status, 'holding')
    assert.ok(bought.buy_note_id)

    const sold = await sellStockTransaction(client, {
      userId: '22222222-2222-4222-8222-222222222222',
      stockId: 'stock-2',
      exitReason: '达到阶段目标后退出',
    })
    assert.equal(sold.status, 'watching')
    assert.ok(sold.sell_note_id)

    const state = await client.query('SELECT status, entry_price, loss_rate, entered_at FROM stocks WHERE id = $1', ['stock-2'])
    assert.deepEqual(state.rows[0], {
      status: 'watching',
      entry_price: null,
      loss_rate: null,
      entered_at: null,
    })
    const notes = await client.query('SELECT tags FROM notes ORDER BY created_at')
    assert.deepEqual(notes.rows.map((row) => row.tags), [['buy'], ['sell', 'exit']])
  } finally {
    client.release()
    await pool.end()
  }
})

async function createTradeTables(client: import('pg').PoolClient) {
  await client.query(`
    CREATE TEMP TABLE stocks (
      id varchar(36) PRIMARY KEY,
      user_id uuid NOT NULL,
      code varchar(20) NOT NULL,
      name varchar(100) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'watching',
      current_price numeric(12,2),
      entry_price numeric(12,2),
      loss_rate numeric(5,2),
      entered_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    CREATE TEMP TABLE notes (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      stock_id varchar(36) NOT NULL,
      stock_code varchar(20) NOT NULL,
      stock_name varchar(100) NOT NULL,
      type varchar(10) NOT NULL,
      title varchar(200) NOT NULL,
      content text NOT NULL CHECK (content <> 'force-note-failure'),
      direction varchar(10),
      entry_price numeric(12,2),
      target_price numeric(12,2),
      stop_loss numeric(12,2),
      tags text[] NOT NULL DEFAULT '{}',
      event text,
      source text,
      images jsonb NOT NULL DEFAULT '[]'::jsonb,
      ai_summary text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}
