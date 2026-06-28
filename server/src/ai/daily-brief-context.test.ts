import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDailyBriefPrompt,
  formatDailyBriefNewsContext,
  shouldUseLLMForDailyBrief,
  type DailyBriefPromptInput,
} from './daily-brief.service'

const baseInput: DailyBriefPromptInput = {
  stock: {
    name: '兆易创新',
    code: '603986',
    industry: '半导体',
    status: 'watching',
    entry_price: null,
    loss_rate: null,
    current_price: '770.00',
    change_percent: '-0.67',
  },
  buyReasonText: '(无明确买入理由)',
  recentNotes: [
    { direction: 'bull', title: '长周期存储景气回升', content: '关注 Nor Flash 与 MCU 需求恢复。' },
    { direction: 'neutral', title: '短线估值偏高', content: '等待业绩兑现。' },
  ],
  indicators: {
    ma5: '780.00',
    ma20: '742.00',
    ma60: '690.00',
    macd: { dif: '12.50', dea: '10.20', hist: '4.60' },
    rsi14: '66.20',
    boll: { upper: '805.00', mid: '742.00', lower: '679.00' },
    volRatio: 1.42,
    lastClose: 770,
    summary: 'MA20=742 RSI=66.20 布林带 679-805',
  },
  historySampleSize: 60,
  stopLossMessage: '股票不在持有状态',
  newsContext: '1. 存储芯片涨价延续 | 来源: news.cn | 日期: 2026-06-28 | 摘要: 行业库存下降，部分产品价格上行。',
  fundamentalsContext: '行业:半导体；持仓状态:观察中；当前价:¥770.00；涨跌幅:-0.67%；买入/止损三件套未完整配置。',
}

test('daily brief prompt prioritizes latest technical, news and fundamentals context', () => {
  const prompt = buildDailyBriefPrompt(baseInput)

  assert.match(prompt, /技术指标优先/)
  assert.match(prompt, /最新新闻\/公开资料/)
  assert.match(prompt, /基本面与估值线索/)
  assert.match(prompt, /不要编造新闻/)
  assert.match(prompt, /存储芯片涨价延续/)
  assert.match(prompt, /行业:半导体/)
  assert.match(prompt, /输出严格 JSON/)
})

test('daily brief prompt includes recent note content as auxiliary context instead of titles only', () => {
  const prompt = buildDailyBriefPrompt(baseInput)

  assert.match(prompt, /长周期存储景气回升：关注 Nor Flash 与 MCU 需求恢复/)
  assert.match(prompt, /短线估值偏高：等待业绩兑现/)
})

test('news context is bounded and marks unavailable search explicitly', () => {
  assert.equal(formatDailyBriefNewsContext([]), '联网新闻暂不可用或无有效结果；本次判断不得编造新闻，只能基于技术面、基本面与历史笔记。')

  const context = formatDailyBriefNewsContext([
    {
      title: 'A'.repeat(220),
      url: 'https://example.com/a',
      content: 'B'.repeat(900),
      published_date: '2026-06-28',
    },
  ])

  assert.ok(context.length < 900)
  assert.match(context, /^1\. A+/)
  assert.match(context, /日期: 2026-06-28/)
})

test('daily brief uses LLM for watching and holding stocks unless stop-loss is triggered', () => {
  assert.equal(shouldUseLLMForDailyBrief('watching', 'inactive'), true)
  assert.equal(shouldUseLLMForDailyBrief('holding', 'ok'), true)
  assert.equal(shouldUseLLMForDailyBrief('holding', 'triggered'), false)
})
