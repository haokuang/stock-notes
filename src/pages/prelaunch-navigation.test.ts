import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLibraryNotesUrl,
  buildSearchUrl,
  normalizeDailyBrief,
  normalizeHeatmap,
  resolveLibraryRoute,
} from './prelaunch-navigation'

test('builds a library query with inclusive local date boundaries', () => {
  const url = buildLibraryNotesUrl({
    stockId: 'stock-1',
    type: 'doc',
    direction: 'all',
    dateFrom: '2026-06-15',
    dateTo: '2026-06-15',
  })
  const query = new URL(`https://local${url}`).searchParams

  assert.equal(query.get('stock_id'), 'stock-1')
  assert.equal(query.get('type'), 'doc')
  assert.equal(query.get('direction'), null)
  assert.equal(query.get('from'), '2026-06-15T00:00:00+08:00')
  assert.equal(query.get('to'), '2026-06-15T23:59:59.999+08:00')
})

test('resets persisted tab filters when entering the library from a heatmap day', () => {
  assert.deepEqual(
    resolveLibraryRoute({
      stockId: 'stock-1',
      type: 'doc',
      direction: 'bear',
      dateFrom: '',
      dateTo: '',
    }, {
      date_from: '2026-06-14',
      date_to: '2026-06-14',
    }),
    {
      stockId: '',
      type: 'all',
      direction: 'all',
      dateFrom: '2026-06-14',
      dateTo: '2026-06-14',
    },
  )
})

test('normalizes heatmap map data into descending buckets', () => {
  const normalized = normalizeHeatmap({
    data: { '2026-06-14': 1, '2026-06-15': 3 },
    total: 4,
    activeDays: 2,
    fromDays: 90,
  })

  assert.deepEqual(normalized.buckets, [
    { date: '2026-06-15', count: 3, notes: [] },
    { date: '2026-06-14', count: 1, notes: [] },
  ])
  assert.equal(normalized.activeDays, 2)
})

test('builds search URL from the requested mode instead of stale state', () => {
  assert.equal(buildSearchUrl('note', '茅台'), '/api/notes?keyword=%E8%8C%85%E5%8F%B0&limit=50')
  assert.equal(buildSearchUrl('stock', ''), '/api/stocks?keyword=')
})

test('normalizes the current daily brief API envelope for the report page', () => {
  assert.deepEqual(
    normalizeDailyBrief({
      brief: {
        technical_analysis: '维持观察',
        signal: 'yellow',
        updated_at: '2026-06-15T08:00:00.000Z',
      },
      usedLLM: true,
    }, { code: '600519', name: '贵州茅台' }),
    {
      stock_code: '600519',
      stock_name: '贵州茅台',
      change_percent: null,
      vs5d_avg_volume: null,
      summary: '维持观察',
      key_points: ['信号：中性谨慎'],
      search_results: [],
      mock: false,
      generated_at: '2026-06-15T08:00:00.000Z',
    },
  )
})
