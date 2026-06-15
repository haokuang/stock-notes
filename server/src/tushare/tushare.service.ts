import { Injectable, Logger } from '@nestjs/common'
import {
  filterOrdinaryAStocks,
  isOrdinaryAStock,
  StockBasicRecord,
} from './stock-search'

const TUSHARE_API = 'https://api.tushare.pro'

export interface StockBasic {
  ts_code: string
  symbol: string
  name: string
  industry: string
  market: string
  exchange: string
  list_status: string
  list_date?: string
}

export interface StockSearchResult {
  code: string
  tsCode: string
  name: string
  industry: string
  market: string
  exchange: string
}

export interface DailyQuote {
  ts_code: string
  trade_date: string
  quote_time?: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  pre_close: number | null
  change: number | null
  pct_chg: number | null
  vol: number | null
  amount: number | null
}

interface TushareResponse<T = unknown> {
  code: number
  msg: string | null
  data?: {
    fields: string[]
    items: Array<Array<unknown>>
    has_more?: boolean
  }
}

/**
 * Tushare HTTP 客户端
 * 仅做最薄一层包装：POST JSON，3s 超时，结构化返回 fields/items。
 */
@Injectable()
export class TushareService {
  private readonly logger = new Logger(TushareService.name)
  private listedStocksCache: StockBasicRecord[] | null = null
  private listedStocksCacheExpiresAt = 0

  /** 任意 Tushare 接口调用 */
  async request<T = Record<string, unknown>>(
    api_name: string,
    params: Record<string, unknown> = {},
    fields?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const token = process.env.TUSHARE_TOKEN
    if (!token) {
      this.logger.warn('TUSHARE_TOKEN 未配置')
      return []
    }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(TUSHARE_API, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name,
          token,
          params,
          fields,
        }),
      })
      clearTimeout(timeout)
      if (!res.ok) {
        this.logger.warn(`Tushare ${api_name} HTTP ${res.status}`)
        return []
      }
      const json = (await res.json()) as TushareResponse<T>
      if (json.code !== 0) {
        this.logger.warn(`Tushare ${api_name} err: ${json.msg}`)
        return []
      }
      if (!json.data?.fields || !json.data?.items) return []
      return json.data.items.map((row) => {
        const obj: Record<string, unknown> = {}
        json.data!.fields.forEach((f, i) => (obj[f] = row[i]))
        return obj
      })
    } catch (err) {
      this.logger.warn(`Tushare ${api_name} 异常: ${(err as Error).message}`)
      return []
    }
  }

  /** 股票基础信息（用于添加自选股时自动补全 industry/market） */
  async getStockBasic(ts_code: string): Promise<StockBasic | null> {
    const rows = await this.request<StockBasic>(
      'stock_basic',
      { ts_code },
      'ts_code,symbol,name,industry,market,exchange,list_status,list_date',
    )
    if (!rows.length) return null
    return this.toStockBasic(rows[0])
  }

  async searchListedOrdinaryStocks(keyword: string, limit = 20): Promise<StockSearchResult[]> {
    const stocks = await this.getListedStocks()
    return filterOrdinaryAStocks(stocks, keyword, limit).map((stock) => this.toSearchResult(stock))
  }

  async getListedOrdinaryStock(code: string): Promise<StockSearchResult | null> {
    const normalizedCode = code.trim().toUpperCase()
    const tsCode = normalizedCode.includes('.')
      ? normalizedCode
      : this.toTushareCode(normalizedCode)
    const stock = await this.getStockBasic(tsCode)
    if (!stock || !isOrdinaryAStock(stock)) return null
    return this.toSearchResult(stock)
  }

  /** 拉取最近 N 天的日线（默认 5 天），用于同步最新行情 */
  async getDaily(ts_code: string, days = 5): Promise<DailyQuote[]> {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)
    const start_str = start.toISOString().slice(0, 10).replace(/-/g, '')
    const end_str = end.toISOString().slice(0, 10).replace(/-/g, '')

    const rows = await this.request<DailyQuote>(
      'daily',
      { ts_code, start_date: start_str, end_date: end_str },
    )
    return rows
      .map((r) => ({
        ts_code: String(r.ts_code ?? ts_code),
        trade_date: String(r.trade_date ?? ''),
        open: r.open != null ? Number(r.open) : null,
        high: r.high != null ? Number(r.high) : null,
        low: r.low != null ? Number(r.low) : null,
        close: r.close != null ? Number(r.close) : null,
        pre_close: r.pre_close != null ? Number(r.pre_close) : null,
        change: r.change != null ? Number(r.change) : null,
        pct_chg: r.pct_chg != null ? Number(r.pct_chg) : null,
        vol: r.vol != null ? Number(r.vol) : null,
        amount: r.amount != null ? Number(r.amount) : null,
      }))
      .filter((q) => q.trade_date)
  }

  /** 仅取最近一个交易日的报价（拉 1 天数据取最新一条） */
  async getLatestQuote(ts_code: string): Promise<DailyQuote | null> {
    const list = await this.getDaily(ts_code, 5)
    if (!list.length) return null
    return list.sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0]
  }

  /**
   * 实时行情(日内)— 调腾讯 qt.gtimg.cn 接口
   * - A 股全市场覆盖, 免费, 无认证
   * - 返回 GBK 编码字符串,格式:
   *   v_sh600519="1~贵州茅台~600519~1291.91~1279.00~1271.18~50495~...~...~20260612161418~12.91~1.01~..."
   *   [3]现价 [5]昨收 [6]今开 [7]成交量(手)
   *   [30]时间 yyyyMMddHHmmss [32]涨跌额 [33]涨跌幅%
   *   [36]最高 [37]最低
   * - 失败兜底:返回 null 让调用方降级到 Tushare daily
   */
  async getRealtimeQuote(code: string): Promise<DailyQuote | null> {
    const symbol = this.toTencentSymbol(code)
    if (!symbol) return null
    const url = `https://qt.gtimg.cn/q=${symbol}`
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) {
        this.logger.warn(`tencent ${code} HTTP ${res.status}`)
        return null
      }
      // 腾讯返回 GBK;Node fetch 默认 utf-8,需要转换
      const buf = await res.arrayBuffer()
      const text = Buffer.from(buf).toString('binary')
      const m = text.match(/="([^"]+)"/)
      if (!m) return null
      const fields = m[1].split('~')
      if (fields.length < 35) return null
      const close = Number(fields[3])            // [3]=现价(腾讯已返回真实价格,如 1291.91,不是分)
      const preClose = Number(fields[4])         // [4]=昨收
      const open = Number(fields[5])             // [5]=今开
      const high = Number(fields[33])            // [33]=最高
      const low = Number(fields[34])             // [34]=最低
      const change = Number(fields[31])          // [31]=涨跌额
      const pctChg = Number(fields[32])          // [32]=涨跌幅%
      const vol = Number(fields[6])              // [6]=成交量(手)
      const timeStr = fields[30] || ''  // [29]=时间 yyyyMMddHHmmss
      const tradeDate = timeStr.length >= 8 ? timeStr.slice(0, 8) : undefined
      if (close == null) return null
      return {
        ts_code: code,
        trade_date: tradeDate,
        quote_time: timeStr.length >= 14 ? timeStr : undefined,
        open,
        high,
        low,
        close,
        pre_close: preClose,
        change,
        pct_chg: pctChg,
        vol,
        amount: null,
      } as DailyQuote
    } catch (e) {
      this.logger.warn(`tencent ${code} 异常: ${(e as Error).message}`)
      return null
    }
  }

  private parseNumber(v: string | undefined): number | null {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }

  private async getListedStocks(): Promise<StockBasicRecord[]> {
    if (this.listedStocksCache && Date.now() < this.listedStocksCacheExpiresAt) {
      return this.listedStocksCache
    }
    const rows = await this.request<StockBasicRecord>(
      'stock_basic',
      { list_status: 'L' },
      'ts_code,symbol,name,industry,market,exchange,list_status,list_date',
    )
    this.listedStocksCache = rows.map((row) => this.toStockBasic(row))
    this.listedStocksCacheExpiresAt = Date.now() + 6 * 60 * 60 * 1000
    return this.listedStocksCache
  }

  private toStockBasic(row: Record<string, unknown>): StockBasicRecord {
    return {
      ts_code: String(row.ts_code ?? ''),
      symbol: String(row.symbol ?? ''),
      name: String(row.name ?? ''),
      industry: String(row.industry ?? ''),
      market: String(row.market ?? ''),
      exchange: String(row.exchange ?? ''),
      list_status: String(row.list_status ?? ''),
      list_date: row.list_date ? String(row.list_date) : undefined,
    }
  }

  private toSearchResult(stock: StockBasicRecord): StockSearchResult {
    return {
      code: stock.symbol,
      tsCode: stock.ts_code,
      name: stock.name,
      industry: stock.industry,
      market: stock.market,
      exchange: stock.exchange,
    }
  }

  private toTushareCode(code: string): string {
    if (/^(600|601|603|605|688|689)/.test(code)) return `${code}.SH`
    if (/^(000|001|002|003|300|301)/.test(code)) return `${code}.SZ`
    if (/^(4|8|9)/.test(code)) return `${code}.BJ`
    return code
  }

  private toTencentSymbol(code: string): string | null {
    const c = code.trim().toUpperCase()
    if (!c) return null
    if (/^[0-9]{6}$/.test(c)) {
      const prefix = /^(6|9|5)/.test(c) ? 'sh' : 'sz'
      return `${prefix}${c}`
    }
    if (c.endsWith('.SH')) return `sh${c.slice(0, 6)}`
    if (c.endsWith('.SZ')) return `sz${c.slice(0, 6)}`
    if (c.endsWith('.BJ')) return `bj${c.slice(0, 6)}`
    return null
  }
}
