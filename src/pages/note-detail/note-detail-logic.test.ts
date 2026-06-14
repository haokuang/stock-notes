import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNotePrice, hasNotePrice } from './note-detail-logic'

test('formats numeric database strings as prices', () => {
  assert.equal(formatNotePrice('123.45'), '¥123.45')
  assert.equal(formatNotePrice(8), '¥8.00')
  assert.equal(formatNotePrice(null), '—')
})

test('only shows the price section for usable values', () => {
  assert.equal(hasNotePrice('0'), true)
  assert.equal(hasNotePrice(null), false)
  assert.equal(hasNotePrice(''), false)
})
