import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'dotenv'
import { Pool, type PoolClient } from 'pg'
import { createDatabasePoolConfig } from '../storage/database/connection-config'
import { fetchSummary } from './stocks.service'

config({ path: '.env.local' })

function createTestPool(): Pool {
  return new Pool(
    createDatabasePoolConfig({
      ...process.env,
      DB_CONNECTION_PROFILE: 'pooler-session',
    }),
  )
}

test('summary returns counts scoped to the requesting user', async () => {
  const pool = createTestPool()
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const userA = '11111111-1111-4111-8111-111111111111'
    const userB = '22222222-2222-4222-8222-222222222222'
    await seedStock(client, 's-a1', userA, '600001', 'A股票1')
    await seedStock(client, 's-a2', userA, '600002', 'A股票2')
    await seedStock(client, 's-b1', userB, '000001', 'B股票1')
    await seedNote(client, 'n-a1', userA, 's-a1', 'note', 'bull')
    await seedNote(client, 'n-a2', userA, 's-a1', 'note', 'bull')
    await seedNote(client, 'n-a3', userA, 's-a1', 'note', 'bear')
    await seedNote(client, 'n-a4', userA, 's-a1', 'doc', 'bull') // type=doc, 不计入 bull
    await seedNote(client, 'n-b1', userB, 's-b1', 'note', 'bull')
    await seedReport(client, 'r-a1', userA, 's-a1')
    await seedReport(client, 'r-a2', userA, 's-a1')
    await seedReport(client, 'r-b1', userB, 's-b1')

    const summaryA = await fetchSummary(client, userA)
    assert.equal(summaryA.stocks, 2)
    assert.equal(summaryA.notes, 4) // 含 doc
    assert.equal(summaryA.bull, 2) // 仅 type=note 且 direction=bull
    assert.equal(summaryA.reports, 2)

    const summaryB = await fetchSummary(client, userB)
    assert.equal(summaryB.stocks, 1)
    assert.equal(summaryB.notes, 1)
    assert.equal(summaryB.bull, 1)
    assert.equal(summaryB.reports, 1)
  } finally {
    client.release()
    await pool.end()
  }
})

test('summary returns zeros when the user owns nothing', async () => {
  const pool = createTestPool()
  const client = await pool.connect()
  try {
    await setupSchema(client)
    const lonely = '33333333-3333-4333-8333-333333333333'
    const summary = await fetchSummary(client, lonely)
    assert.equal(summary.stocks, 0)
    assert.equal(summary.notes, 0)
    assert.equal(summary.bull, 0)
    assert.equal(summary.reports, 0)
  } finally {
    client.release()
    await pool.end()
  }
})

// ============== helpers ==============

async function setupSchema(client: PoolClient) {
  await client.query('SET search_path TO pg_temp')
  await client.query('DROP TABLE IF EXISTS pg_temp.ai_reports')
  await client.query('DROP TABLE IF EXISTS pg_temp.notes')
  await client.query('DROP TABLE IF EXISTS pg_temp.stocks')
  await client.query(`
    CREATE TEMP TABLE stocks (
      id varchar(36) PRIMARY KEY,
      user_id uuid NOT NULL,
      code varchar(20) NOT NULL,
      name varchar(100) NOT NULL,
      subject_type varchar(10) NOT NULL DEFAULT 'stock',
      status varchar(10) NOT NULL DEFAULT 'watching',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    CREATE TEMP TABLE notes (
      id varchar(36) PRIMARY KEY,
      user_id uuid NOT NULL,
      stock_id varchar(36) NOT NULL,
      type varchar(10) NOT NULL,
      direction varchar(10),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await client.query(`
    CREATE TEMP TABLE ai_reports (
      id varchar(36) PRIMARY KEY,
      user_id uuid NOT NULL,
      stock_id varchar(36),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function seedStock(
  client: PoolClient,
  id: string,
  userId: string,
  code: string,
  name: string,
) {
  await client.query(
    'INSERT INTO stocks (id, user_id, code, name) VALUES ($1, $2, $3, $4)',
    [id, userId, code, name],
  )
}

async function seedNote(
  client: PoolClient,
  id: string,
  userId: string,
  stockId: string,
  type: string,
  direction: string | null,
) {
  await client.query(
    'INSERT INTO notes (id, user_id, stock_id, type, direction) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, stockId, type, direction],
  )
}

async function seedReport(
  client: PoolClient,
  id: string,
  userId: string,
  stockId: string,
) {
  await client.query(
    'INSERT INTO ai_reports (id, user_id, stock_id) VALUES ($1, $2, $3)',
    [id, userId, stockId],
  )
}
