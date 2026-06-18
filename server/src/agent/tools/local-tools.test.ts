import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentRepository } from '../agent.repository'

function makePool(rowsByCall: unknown[][]) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  return {
    calls,
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values })
      return { rows: rowsByCall.shift() ?? [] }
    },
  }
}

const stockRow = {
  id: 'stock-1', user_id: 'user-1', code: '600519', name: '贵州茅台', industry: '白酒',
  current_price: '1700.00', change_amount: '10.00', change_percent: '0.59',
  price_date: '20260618', open_price: '1690.00', high_price: '1710.00',
  low_price: '1680.00', pre_close: '1690.00', volume: '1000', amount: '1700000.00',
  last_sync_at: '2026-06-18T01:00:00.000Z', note: '', sort_order: 0,
  created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-18T01:00:00.000Z',
}

const priceRow = {
  id: 'price-1', user_id: 'user-1', stock_id: 'stock-1', trade_date: '20260618',
  open_price: '1690.00', high_price: '1710.00', low_price: '1680.00',
  close_price: '1700.00', pre_close: '1690.00', change_amount: '10.00',
  change_percent: '0.59', volume: '1000', amount: '1700000.00',
  created_at: '2026-06-18T01:00:00.000Z',
}

const noteRow = {
  id: 'note-1', user_id: 'user-1', stock_id: 'stock-1', stock_code: '600519',
  stock_name: '贵州茅台', type: 'note', title: '看好', content: 'content-1',
  doc_md: null, direction: 'bull', entry_price: '1650.00', target_price: '1800.00',
  stop_loss: '1600.00', tags: ['long'], event: null, source: null,
  images: [], ai_summary: null, source_ref: null, created_at: '2026-06-10T00:00:00.000Z',
  updated_at: '2026-06-10T00:00:00.000Z',
}

const briefRow = {
  id: 'brief-1', user_id: 'user-1', stock_id: 'stock-1', trade_date: '20260618',
  signal: 'green', technical_analysis: '趋势向好', logic_judgment: '估值合理',
  action: 'hold', sell_reasons: [], evidence_note_ids: [], price_at_brief: '1700.00',
  stop_loss_triggered: false, created_at: '2026-06-18T01:30:00.000Z',
  updated_at: '2026-06-18T01:30:00.000Z',
}

test('getStockProfile returns own stock only and projects DTO fields', async () => {
  const pool = makePool([[stockRow]])
  const repository = new AgentRepository(pool as never)

  const profile = await repository.getStockProfile('user-1', 'stock-1')
  assert.ok(profile)
  assert.equal(profile.code, '600519')
  assert.equal(profile.name, '贵州茅台')
  assert.equal('id' in profile, false)
  assert.equal('user_id' in profile, false)
  assert.match(pool.calls[0].text, /FROM stocks/)
  assert.match(pool.calls[0].text, /user_id = \$1 AND id = \$2/)
  assert.deepEqual(pool.calls[0].values, ['user-1', 'stock-1'])
})

test('getStockProfile returns null for another user', async () => {
  const pool = makePool([[]])
  const repository = new AgentRepository(pool as never)
  assert.equal(await repository.getStockProfile('user-2', 'stock-1'), null)
})

test('getPriceHistory requests at most 120 rows in descending order', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...priceRow, id: `price-${i}`, trade_date: `202606${String(i).padStart(2, '0')}` }))
  const pool = makePool([rows])
  const repository = new AgentRepository(pool as never)

  const prices = await repository.getPriceHistory('user-1', 'stock-1')
  assert.equal(prices.length, 5)
  assert.match(pool.calls[0].text, /FROM stock_prices/)
  assert.match(pool.calls[0].text, /user_id = \$1 AND stock_id = \$2/)
  assert.match(pool.calls[0].text, /ORDER BY trade_date DESC/)
  assert.match(pool.calls[0].text, /LIMIT \$3/)
  assert.equal(pool.calls[0].values.at(-1), 120)
})

test('getStockNotes requests at most 50 rows and truncates content to 4000 chars', async () => {
  const longContent = 'x'.repeat(8000)
  const rows = [{ ...noteRow, id: 'note-1', content: longContent }]
  const pool = makePool([rows])
  const repository = new AgentRepository(pool as never)

  const notes = await repository.getStockNotes('user-1', 'stock-1')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].content.length, 4000)
  assert.match(pool.calls[0].text, /FROM notes/)
  assert.match(pool.calls[0].text, /user_id = \$1 AND stock_id = \$2/)
  assert.equal(pool.calls[0].values.at(-1), 50)
})

test('getDailyBriefs requests at most 7 rows descending', async () => {
  const rows = [{ ...briefRow, id: 'brief-1' }]
  const pool = makePool([rows])
  const repository = new AgentRepository(pool as never)

  const briefs = await repository.getDailyBriefs('user-1', 'stock-1')
  assert.equal(briefs.length, 1)
  assert.match(pool.calls[0].text, /FROM stock_briefs/)
  assert.match(pool.calls[0].text, /user_id = \$1 AND stock_id = \$2/)
  assert.match(pool.calls[0].text, /ORDER BY trade_date DESC/)
  assert.equal(pool.calls[0].values.at(-1), 7)
})