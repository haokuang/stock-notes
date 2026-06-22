import assert from 'node:assert/strict'
import test from 'node:test'
import * as subject from './subject'
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

test('uses market language in an A-share market Agent conversation', () => {
  const getResearchAgentCopy = (subject as typeof subject & {
    getResearchAgentCopy?: (subjectType: 'stock' | 'market') => {
      navigationTitle: string
      emptyPrompt: string
    }
  }).getResearchAgentCopy

  assert.equal(typeof getResearchAgentCopy, 'function')
  assert.deepEqual(getResearchAgentCopy?.('market'), {
    navigationTitle: '市场研究 Agent',
    emptyPrompt: '例如：结合我的历史笔记，梳理当前 A 股市场的主线、资金偏好与核心风险。',
  })
  assert.deepEqual(getResearchAgentCopy?.('stock'), {
    navigationTitle: '股票研究 Agent',
    emptyPrompt: '例如：结合我的历史笔记，梳理这只股票未来两个季度的核心催化与风险。',
  })
})
