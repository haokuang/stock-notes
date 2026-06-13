import { IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
  entry_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stop_loss?: number;

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
  entry_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stop_loss?: number;

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
