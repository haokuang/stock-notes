import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReportNavigation,
  filterReportsForStock,
  mapAgentReportSummary,
  pickReportLoadOrder,
  sortAgentReportsByCreatedDesc,
} from './agent-report-view'
import type { AgentReportSummary } from './agent.types'

function makeSummary(partial: Partial<AgentReportSummary>): AgentReportSummary {
  return {
    id: partial.id ?? 'r-1',
    stockId: partial.stockId ?? 'stock-1',
    stockCode: partial.stockCode ?? '600519',
    stockName: partial.stockName ?? '贵州茅台',
    title: partial.title ?? '贵州茅台 · Agent 投研报告',
    status: partial.status ?? 'done',
    agentRunId: partial.agentRunId ?? 'run-1',
    createdAt: partial.createdAt ?? '2026-06-18T10:00:00.000Z',
  }
}

test('mapAgentReportSummary trims to the navigation shape', () => {
  const entry = mapAgentReportSummary(makeSummary({}))
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'id', 'status', 'title'])
})

test('sortAgentReportsByCreatedDesc orders latest first', () => {
  const items = [
    makeSummary({ id: 'r-1', createdAt: '2026-06-18T09:00:00.000Z' }),
    makeSummary({ id: 'r-3', createdAt: '2026-06-18T11:00:00.000Z' }),
    makeSummary({ id: 'r-2', createdAt: '2026-06-18T10:00:00.000Z' }),
  ]
  const sorted = sortAgentReportsByCreatedDesc(items)
  assert.deepEqual(sorted.map((s) => s.id), ['r-3', 'r-2', 'r-1'])
})

test('filterReportsForStock excludes other stocks', () => {
  const items = [
    makeSummary({ id: 'r-1', stockId: 'stock-1' }),
    makeSummary({ id: 'r-2', stockId: 'stock-2' }),
  ]
  const filtered = filterReportsForStock(items, 'stock-1')
  assert.deepEqual(filtered.map((s) => s.id), ['r-1'])
})

test('buildReportNavigation encodes the report id for the ai-report page', () => {
  assert.equal(buildReportNavigation('report-1'), '/pages/ai-report/index?report_id=report-1')
})

test('pickReportLoadOrder prefers agent report id over legacy fallbacks', () => {
  assert.equal(pickReportLoadOrder({ reportId: 'r1', legacyReportId: 'r2', briefId: 'r3', stockId: 'r4' }), 'r1')
  assert.equal(pickReportLoadOrder({ reportId: null, legacyReportId: 'r2', briefId: 'r3', stockId: 'r4' }), 'r2')
  assert.equal(pickReportLoadOrder({ reportId: null, legacyReportId: null, briefId: 'r3', stockId: 'r4' }), 'r3')
  assert.equal(pickReportLoadOrder({ reportId: null, legacyReportId: null, briefId: null, stockId: 'r4' }), 'r4')
  assert.equal(pickReportLoadOrder({ reportId: null, legacyReportId: null, briefId: null, stockId: null }), null)
})