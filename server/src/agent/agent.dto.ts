import { Transform } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

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
