import type { SubjectType } from '@/stocks/subject'

export function detailRequestUrls(
  subjectType: SubjectType,
  stockId: string,
): string[] {
  const common = [
    `/api/notes?stock_id=${stockId}&limit=100`,
    `/api/notes/summary/${stockId}`,
    `/api/notes/distribution/${stockId}`,
  ]
  return subjectType === 'market'
    ? common
    : [
        ...common,
        `/api/stocks/${stockId}/stop-loss-alert`,
        `/api/stocks/${stockId}/brief?days=7`,
      ]
}

export function detailCapabilities(subjectType: SubjectType) {
  const equity = subjectType === 'stock'
  return {
    price: equity,
    trading: equity,
    brief: equity,
    notes: true,
    agent: true,
  }
}
