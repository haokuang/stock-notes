import { IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum NoteDirection {
  BULL = 'bull',
  BEAR = 'bear',
  NEUTRAL = 'neutral',
}

export enum NoteType {
  NOTE = 'note',
  DOC = 'doc',
}

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  stock_id: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsIn([NoteType.NOTE, NoteType.DOC])
  type?: NoteType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  /** 文档类：原始 markdown 源 */
  @IsOptional()
  @IsString()
  doc_md?: string;

  @IsOptional()
  @IsEnum(NoteDirection)
  direction?: NoteDirection;

  @IsOptional()
  @IsNumber()
  @Min(0)
  entry_price?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stop_loss?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  ai_summary?: string;

  @IsOptional()
  @IsString()
  related_event?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  doc_md?: string;

  @IsOptional()
  @IsEnum(NoteDirection)
  direction?: NoteDirection;

  @IsOptional()
  @IsNumber()
  @Min(0)
  entry_price?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stop_loss?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  ai_summary?: string;

  @IsOptional()
  @IsString()
  related_event?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class QueryNoteDto {
  @IsOptional()
  @IsString()
  stock_id?: string;

  @IsOptional()
  @IsEnum(NoteDirection)
  direction?: NoteDirection;

  /** 按类型筛选：note / doc / 不传=全部 */
  @IsOptional()
  @IsIn([NoteType.NOTE, NoteType.DOC])
  type?: NoteType;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RenderMdDto {
  @IsString()
  @IsNotEmpty()
  md: string;
}

export class CreateHighlightDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  selected_text!: string;

  @IsString()
  @MaxLength(32)
  prefix_text!: string;

  @IsString()
  @MaxLength(32)
  suffix_text!: string;

  @IsInt()
  @Min(0)
  start_offset!: number;

  @IsInt()
  @Min(1)
  end_offset!: number;

  @IsString()
  @IsNotEmpty()
  source_hash!: string;
}
