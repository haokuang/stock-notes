import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterOrdinaryAStocks,
  isOrdinaryAStock,
  rankStockSearchResults,
} from './stock-search'
import { TushareService } from './tushare.service'

const stocks = [
  {
    ts_code: '600519.SH',
    symbol: '600519',
    name: '贵州茅台',
    industry: '白酒',
    market: '主板',
    exchange: 'SSE',
    list_status: 'L',
  },
  {
    ts_code: '000001.SZ',
    symbol: '000001',
    name: '平安银行',
    industry: '银行',
    market: '主板',
    exchange: 'SZSE',
    list_status: 'L',
  },
  {
    ts_code: '920001.BJ',
    symbol: '920001',
    name: '北交样例',
    industry: '制造',
    market: '北交所',
    exchange: 'BSE',
    list_status: 'L',
  },
]

test('accepts listed ordinary A shares from Shanghai, Shenzhen and Beijing', () => {
  for (const stock of stocks) {
    assert.equal(isOrdinaryAStock(stock), true)
  }
})

test('rejects B shares, delisted shares and non-stock instruments', () => {
  assert.equal(isOrdinaryAStock({ ...stocks[0], symbol: '900901', ts_code: '900901.SH' }), false)
  assert.equal(isOrdinaryAStock({ ...stocks[1], symbol: '200002', ts_code: '200002.SZ' }), false)
  assert.equal(isOrdinaryAStock({ ...stocks[0], list_status: 'D' }), false)
  assert.equal(isOrdinaryAStock({ ...stocks[0], exchange: 'SSE', symbol: '510300', ts_code: '510300.SH' }), false)
})

test('filters by code or Chinese name and caps the result count', () => {
  assert.deepEqual(
    filterOrdinaryAStocks(stocks, '平安', 10).map((stock) => stock.symbol),
    ['000001'],
  )
  assert.deepEqual(
    filterOrdinaryAStocks(stocks, '920', 1).map((stock) => stock.symbol),
    ['920001'],
  )
})

test('ranks an exact code before name matches', () => {
  const ranked = rankStockSearchResults(
    [
      stocks[0],
      { ...stocks[0], symbol: '601888', ts_code: '601888.SH', name: '中国中免600519' },
    ],
    '600519',
  )
  assert.deepEqual(ranked.map((stock) => stock.symbol), ['600519', '601888'])
})

test('searches listed ordinary A shares through the Tushare service', async () => {
  const service = new TushareService()
  service.request = async () => [
    stocks[0],
    { ...stocks[0], symbol: '900901', ts_code: '900901.SH', name: '云赛B股' },
  ]

  const result = await service.searchListedOrdinaryStocks('茅台', 10)

  assert.deepEqual(result, [{
    code: '600519',
    tsCode: '600519.SH',
    name: '贵州茅台',
    industry: '白酒',
    market: '主板',
    exchange: 'SSE',
  }])
})

test('rejects an exact code when Tushare says it is not an ordinary A share', async () => {
  const service = new TushareService()
  service.request = async () => [
    { ...stocks[0], symbol: '900901', ts_code: '900901.SH', name: '云赛B股' },
  ]

  assert.equal(await service.getListedOrdinaryStock('900901'), null)
})
