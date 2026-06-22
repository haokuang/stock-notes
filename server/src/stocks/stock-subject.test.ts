import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MARKET_SUBJECT,
  assertEquitySubject,
  isMarketSubject,
} from './stock-subject'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0012_market_subject.sql'),
  'utf8',
)

test('migration adds a stock-compatible subject type constraint', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS subject_type/)
  assert.match(migration, /DEFAULT 'stock'/)
  assert.match(migration, /CHECK \(subject_type IN \('stock', 'market'\)\)/)
})

test('defines one immutable A-share market identity', () => {
  assert.deepEqual(MARKET_SUBJECT, {
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subjectType: 'market',
  })
  assert.equal(isMarketSubject({ subject_type: 'market' }), true)
  assert.equal(isMarketSubject({ subject_type: 'stock' }), false)
})

test('rejects equity-only operations for a market subject', () => {
  assert.throws(
    () => assertEquitySubject({ subject_type: 'market' }),
    /大盘标的不支持此操作/,
  )
  assert.doesNotThrow(() => assertEquitySubject({ subject_type: 'stock' }))
})

test('controller exposes a dedicated market endpoint with HTTP 200 semantics', () => {
  const source = readFileSync(path.resolve(__dirname, './stocks.controller.ts'), 'utf8')
  assert.match(source, /@Post\('market'\)[\s\S]*@HttpCode\(200\)[\s\S]*createMarket/)
})
