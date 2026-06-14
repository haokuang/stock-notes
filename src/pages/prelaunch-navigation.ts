export interface LibraryFilters {
  stockId: string
  type: 'all' | 'note' | 'doc'
  direction: 'all' | 'bull' | 'bear' | 'neutral'
  dateFrom: string
  dateTo: string
}

export interface HeatmapResponse {
  data: Record<string, number>
  total: number
  activeDays: number
  fromDays: number
}

export interface DailyBriefApiResult {
  brief: {
    technical_analysis: string
    signal: 'green' | 'yellow' | 'red'
    updated_at: string
  }
  usedLLM: boolean
}

export function resolveLibraryRoute(
  current: LibraryFilters,
  route: { date_from?: string; date_to?: string },
): LibraryFilters {
  if (!route.date_from && !route.date_to) {
    return { ...current, dateFrom: '', dateTo: '' }
  }
  return {
    stockId: '',
    type: 'all',
    direction: 'all',
    dateFrom: route.date_from ?? '',
    dateTo: route.date_to ?? '',
  }
}

export function buildLibraryNotesUrl(_filters: LibraryFilters): string {
  const filters = _filters
  const params = new URLSearchParams()
  if (filters.stockId) params.set('stock_id', filters.stockId)
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.direction !== 'all' && filters.type !== 'doc') {
    params.set('direction', filters.direction)
  }
  if (filters.dateFrom) params.set('from', `${filters.dateFrom}T00:00:00+08:00`)
  if (filters.dateTo) params.set('to', `${filters.dateTo}T23:59:59.999+08:00`)
  params.set('limit', '100')
  return `/api/notes?${params.toString()}`
}

export function normalizeHeatmap(response: HeatmapResponse) {
  const buckets = Object.entries(response.data ?? {})
    .map(([date, count]) => ({ date, count: Number(count), notes: [] }))
    .sort((left, right) => right.date.localeCompare(left.date))
  return {
    buckets,
    total: Number(response.total ?? 0),
    activeDays: Number(response.activeDays ?? 0),
    fromDays: Number(response.fromDays ?? 0),
  }
}

export function buildSearchUrl(mode: 'stock' | 'note', keyword: string): string {
  const encoded = encodeURIComponent(keyword)
  return mode === 'stock'
    ? `/api/stocks?keyword=${encoded}`
    : `/api/notes?keyword=${encoded}&limit=50`
}

export function normalizeDailyBrief(
  result: DailyBriefApiResult,
  stock: { code: string; name: string },
) {
  const signalLabels = {
    green: '偏乐观',
    yellow: '中性谨慎',
    red: '风险警示',
  }
  return {
    stock_code: stock.code,
    stock_name: stock.name,
    change_percent: null,
    vs5d_avg_volume: null,
    summary: result.brief.technical_analysis,
    key_points: [`信号：${signalLabels[result.brief.signal]}`],
    search_results: [],
    mock: !result.usedLLM,
    generated_at: result.brief.updated_at,
  }
}
