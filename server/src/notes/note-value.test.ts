import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOptionalPrice } from './note-value'

test('normalizes updated prices without turning null into text', () => {
  assert.equal(normalizeOptionalPrice(12.34), '12.34')
  assert.equal(normalizeOptionalPrice(null), null)
  assert.equal(normalizeOptionalPrice(undefined), undefined)
})
