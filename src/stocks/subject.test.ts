import assert from 'node:assert/strict'
import test from 'node:test'
import { MARKET_SUBJECT_META, isMarketSubject, subjectSecondaryText } from './subject'

test('recognizes and labels the fixed market subject', () => {
  const market = {
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subject_type: 'market' as const,
  }
  assert.equal(isMarketSubject(market), true)
  assert.equal(MARKET_SUBJECT_META.label, '市场研究')
  assert.equal(subjectSecondaryText(market), '市场研究')
})

test('keeps stock secondary information', () => {
  assert.equal(subjectSecondaryText({
    code: '600519',
    name: '贵州茅台',
    subject_type: 'stock',
    industry: '白酒',
  }), '600519 · 白酒')
})
