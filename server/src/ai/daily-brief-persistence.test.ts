import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from 'dotenv'
import { Pool } from 'pg'
import { createDatabasePoolConfig } from '../storage/database/connection-config'
import { persistDailyBriefArtifacts } from './daily-brief-persistence'

config({ path: '.env.local' })

function createTestPool(): Pool {
  return new Pool(
    createDatabasePoolConfig({
      ...process.env,
      DB_CONNECTION_PROFILE: 'pooler-session',
    }),
  )
}

test('upserts one brief and one auto note per user, stock and trade date', async () => {
  const pool = createTestPool()
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TEMP TABLE stock_briefs (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        stock_id varchar(36) NOT NULL,
        trade_date varchar(10) NOT NULL,
        signal varchar(10) NOT NULL,
        technical_analysis text NOT NULL DEFAULT '',
        logic_judgment text NOT NULL DEFAULT '',
        action varchar(10) NOT NULL,
        sell_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        evidence_note_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
        price_at_brief numeric(12,2),
        stop_loss_triggered boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, stock_id, trade_date)
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
        content text NOT NULL DEFAULT '',
        doc_md text,
        direction varchar(10),
        entry_price numeric(12,2),
        target_price numeric(12,2),
        stop_loss numeric(12,2),
        tags text[] NOT NULL DEFAULT '{}',
        event text,
        source text,
        source_ref text,
        images jsonb NOT NULL DEFAULT '[]'::jsonb,
        ai_summary text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, source, source_ref)
      )
    `)

    const base = {
      userId: '11111111-1111-4111-8111-111111111111',
      stockId: 'stock-1',
      stockCode: '600519',
      stockName: '贵州茅台',
      tradeDate: '20260615',
      signal: 'green' as const,
      priceAtBrief: '1500.00',
      stopLossTriggered: false,
    }

    const first = await persistDailyBriefArtifacts(client, {
      ...base,
      content: '第一次简评',
      contentHtml: '<p>第一次简评</p>',
    })
    const second = await persistDailyBriefArtifacts(client, {
      ...base,
      signal: 'yellow',
      content: '更新后的简评',
      contentHtml: '<p>更新后的简评</p>',
    })

    assert.equal(second.brief.id, first.brief.id)
    assert.equal(second.noteId, first.noteId)

    const ownBriefs = await client.query(
      'SELECT signal, technical_analysis FROM stock_briefs WHERE user_id = $1',
      [base.userId],
    )
    const ownNotes = await client.query(
      'SELECT doc_md FROM notes WHERE user_id = $1 AND source = $2',
      [base.userId, 'auto-brief'],
    )
    assert.deepEqual(ownBriefs.rows, [{ signal: 'yellow', technical_analysis: '更新后的简评' }])
    assert.deepEqual(ownNotes.rows, [{ doc_md: '更新后的简评' }])

    await persistDailyBriefArtifacts(client, {
      ...base,
      userId: '22222222-2222-4222-8222-222222222222',
      content: '另一位用户的简评',
      contentHtml: '<p>另一位用户的简评</p>',
    })

    const totals = await client.query(`
      SELECT
        (SELECT count(*)::int FROM stock_briefs) AS brief_count,
        (SELECT count(*)::int FROM notes) AS note_count
    `)
    assert.deepEqual(totals.rows[0], { brief_count: 2, note_count: 2 })
  } finally {
    client.release()
    await pool.end()
  }
})
