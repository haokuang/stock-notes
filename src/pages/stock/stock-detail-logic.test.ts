import assert from 'node:assert/strict'
import test from 'node:test'
import { detailCapabilities, detailRequestUrls } from './stock-detail-logic'

test('market detail loads research content without equity endpoints', () => {
  assert.deepEqual(detailRequestUrls('market', 'market-1'), [
    '/api/notes?stock_id=market-1&limit=100',
    '/api/notes/summary/market-1',
    '/api/notes/distribution/market-1',
  ])
  assert.deepEqual(detailCapabilities('market'), {
    price: false,
    trading: false,
    brief: false,
    notes: true,
    agent: true,
  })
})

test('stock detail preserves all existing endpoints and capabilities', () => {
  assert.deepEqual(detailRequestUrls('stock', 'stock-1'), [
    '/api/notes?stock_id=stock-1&limit=100',
    '/api/notes/summary/stock-1',
    '/api/notes/distribution/stock-1',
    '/api/stocks/stock-1/stop-loss-alert',
    '/api/stocks/stock-1/brief?days=7',
  ])
  assert.equal(detailCapabilities('stock').price, true)
})
