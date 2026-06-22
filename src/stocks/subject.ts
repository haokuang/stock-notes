export type SubjectType = 'stock' | 'market'

export interface ResearchSubject {
  id?: string
  code: string
  name: string
  subject_type: SubjectType
  industry?: string | null
}

export const MARKET_SUBJECT_META = Object.freeze({
  code: 'MARKET_A_SHARE',
  name: 'A股大盘',
  label: '市场研究',
})

export function isMarketSubject(
  subject: Pick<ResearchSubject, 'subject_type'>,
): boolean {
  return subject.subject_type === 'market'
}

export function subjectSecondaryText(subject: ResearchSubject): string {
  if (isMarketSubject(subject)) return MARKET_SUBJECT_META.label
  return [subject.code, subject.industry].filter(Boolean).join(' · ')
}
