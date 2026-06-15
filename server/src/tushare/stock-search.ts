export interface StockBasicRecord {
  ts_code: string
  symbol: string
  name: string
  industry: string
  market: string
  exchange: string
  list_status: string
  list_date?: string
}

const ORDINARY_A_SHARE_PATTERNS: Record<string, RegExp> = {
  SSE: /^(600|601|603|605|688|689)\d{3}$/,
  SZSE: /^(000|001|002|003|300|301)\d{3}$/,
  BSE: /^(4|8|9)\d{5}$/,
}

export function isOrdinaryAStock(stock: StockBasicRecord): boolean {
  if (stock.list_status !== 'L') return false
  const pattern = ORDINARY_A_SHARE_PATTERNS[stock.exchange]
  return Boolean(pattern?.test(stock.symbol))
}

function searchRank(stock: StockBasicRecord, keyword: string): number {
  const normalized = keyword.trim().toLowerCase()
  const symbol = stock.symbol.toLowerCase()
  const name = stock.name.toLowerCase()
  if (symbol === normalized) return 0
  if (name === normalized) return 1
  if (symbol.startsWith(normalized)) return 2
  if (name.startsWith(normalized)) return 3
  if (symbol.includes(normalized)) return 4
  if (name.includes(normalized)) return 5
  return 99
}

export function rankStockSearchResults(
  stocks: StockBasicRecord[],
  keyword: string,
): StockBasicRecord[] {
  return [...stocks].sort((left, right) => {
    const rankDiff = searchRank(left, keyword) - searchRank(right, keyword)
    if (rankDiff !== 0) return rankDiff
    return left.symbol.localeCompare(right.symbol)
  })
}

export function filterOrdinaryAStocks(
  stocks: StockBasicRecord[],
  keyword: string,
  limit = 20,
): StockBasicRecord[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return []
  const matches = stocks.filter((stock) => {
    if (!isOrdinaryAStock(stock)) return false
    return stock.symbol.toLowerCase().includes(normalized)
      || stock.name.toLowerCase().includes(normalized)
  })
  return rankStockSearchResults(matches, normalized).slice(0, Math.max(1, Math.min(limit, 50)))
}
