import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import type { AgentProvider } from './agent.types'

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value

export class StockIdQuery {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  stock_id!: string
}

export class CreateAgentThreadDto extends StockIdQuery {}

export class ListAgentMessagesQuery {
  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @IsString()
  limit?: string

  get normalizedLimit(): number {
    const parsed = Number(this.limit ?? 20)
    if (!Number.isFinite(parsed)) return 20
    return Math.max(1, Math.min(50, Math.trunc(parsed)))
  }
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]+$/

export class SubmitAgentMessageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12_000)
  content!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  provider!: AgentProvider

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientRequestId!: string
}

export class RetryAgentRunDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientRequestId!: string

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(36)
  provider?: AgentProvider

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string
}

export const REQUEST_ID_PATTERN = SAFE_REQUEST_ID
export const REQUEST_ID_MIN_LENGTH = 16
export const REQUEST_ID_MAX_LENGTH = 100