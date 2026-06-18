import type { AgentReportSummary } from '../agent/agent.types'

export interface AgentReportEntry {
  id: string
  title: string
  createdAt: string
  status: string
}

export function mapAgentReportSummary(summary: AgentReportSummary): AgentReportEntry {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    status: summary.status,
  }
}

export function sortAgentReportsByCreatedDesc(items: AgentReportSummary[]): AgentReportSummary[] {
  return items.slice().sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id)
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

export function filterReportsForStock(items: AgentReportSummary[], stockId: string): AgentReportSummary[] {
  return items.filter((item) => item.stockId === stockId)
}

export function buildReportNavigation(reportId: string): string {
  return `/pages/ai-report/index?report_id=${encodeURIComponent(reportId)}`
}

export interface AgentReportLoadPreference {
  reportId: string | null
  legacyReportId: string | null
  briefId: string | null
  stockId: string | null
}

export function pickReportLoadOrder(input: AgentReportLoadPreference): string | null {
  return input.reportId ?? input.legacyReportId ?? input.briefId ?? input.stockId
}