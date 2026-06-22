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

export function resolveSubjectType(
  subjectType: string | undefined,
  subjectName: string,
): SubjectType {
  return subjectType === 'market' || subjectName === MARKET_SUBJECT_META.name
    ? 'market'
    : 'stock'
}

export function getResearchAgentCopy(subjectType: SubjectType) {
  if (subjectType === 'market') {
    return {
      navigationTitle: '市场研究 Agent',
      emptyPrompt: '例如：结合我的历史笔记，梳理当前 A 股市场的主线、资金偏好与核心风险。',
    }
  }
  return {
    navigationTitle: '股票研究 Agent',
    emptyPrompt: '例如：结合我的历史笔记，梳理这只股票未来两个季度的核心催化与风险。',
  }
}
