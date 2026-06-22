import { BadRequestException } from '@nestjs/common'

export type StockSubjectType = 'stock' | 'market'

export const MARKET_SUBJECT = Object.freeze({
  code: 'MARKET_A_SHARE',
  name: 'A股大盘',
  subjectType: 'market' as const,
})

export interface SubjectTypeRow {
  subject_type?: string | null
}

export function isMarketSubject(row: SubjectTypeRow): boolean {
  return row.subject_type === 'market'
}

export function assertEquitySubject(row: SubjectTypeRow): void {
  if (isMarketSubject(row)) {
    throw new BadRequestException('大盘标的不支持此操作')
  }
}
