import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB } from '../storage/database/database.module';
import * as schema from '../storage/database/shared/schema';
import { and, desc, eq, gte, lte, sql, asc } from 'drizzle-orm';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { CreateNoteDto, NoteType, QueryNoteDto, RenderMdDto, UpdateNoteDto } from './dto';

@Injectable()
export class NotesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: any) {}

  async list(uid: string, query: QueryNoteDto) {
    const conditions: any[] = [eq(schema.notes.user_id, uid)]
    if (query.stock_id) conditions.push(eq(schema.notes.stock_id, query.stock_id))
    if (query.direction) conditions.push(eq(schema.notes.direction, query.direction))
    if (query.type) conditions.push(eq(schema.notes.type, query.type))
    if (query.from) conditions.push(gte(schema.notes.created_at, new Date(query.from)))
    if (query.to) conditions.push(lte(schema.notes.created_at, new Date(query.to)))
    if (query.keyword) {
      const kw = `%${query.keyword}%`
      conditions.push(
        sql`(${schema.notes.title} ILIKE ${kw} OR ${schema.notes.content} ILIKE ${kw} OR ${schema.notes.doc_md} ILIKE ${kw})`,
      )
    }

    const rows = await this.db
      .select({
        id: schema.notes.id,
        stock_id: schema.notes.stock_id,
        stock_code: schema.stocks.code,
        stock_name: schema.stocks.name,
        type: schema.notes.type,
        title: schema.notes.title,
        content: schema.notes.content,
        doc_md: schema.notes.doc_md,
        direction: schema.notes.direction,
        entry_price: schema.notes.entry_price,
        target_price: schema.notes.target_price,
        stop_loss: schema.notes.stop_loss,
        tags: schema.notes.tags,
        event: schema.notes.event,
        source: schema.notes.source,
        images: schema.notes.images,
        ai_summary: schema.notes.ai_summary,
        created_at: schema.notes.created_at,
        updated_at: schema.notes.updated_at,
      })
      .from(schema.notes)
      .leftJoin(schema.stocks, eq(schema.notes.stock_id, schema.stocks.id))
      .where(and(...conditions))
      .orderBy(desc(schema.notes.created_at))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0)

    return rows
  }

  async getById(uid: string, id: string) {
    const [row] = await this.db
      .select({
        id: schema.notes.id,
        stock_id: schema.notes.stock_id,
        stock_code: schema.stocks.code,
        stock_name: schema.stocks.name,
        type: schema.notes.type,
        title: schema.notes.title,
        content: schema.notes.content,
        doc_md: schema.notes.doc_md,
        direction: schema.notes.direction,
        entry_price: schema.notes.entry_price,
        target_price: schema.notes.target_price,
        stop_loss: schema.notes.stop_loss,
        tags: schema.notes.tags,
        event: schema.notes.event,
        source: schema.notes.source,
        images: schema.notes.images,
        ai_summary: schema.notes.ai_summary,
        created_at: schema.notes.created_at,
        updated_at: schema.notes.updated_at,
      })
      .from(schema.notes)
      .leftJoin(schema.stocks, eq(schema.notes.stock_id, schema.stocks.id))
      .where(and(eq(schema.notes.id, id), eq(schema.notes.user_id, uid)))
      .limit(1)
    if (!row) throw new NotFoundException(`观点/文档 ${id} 不存在`)
    return row
  }

  async create(uid: string, dto: CreateNoteDto) {
    const [stock] = await this.db
      .select({ code: schema.stocks.code, name: schema.stocks.name, user_id: schema.stocks.user_id })
      .from(schema.stocks)
      .where(eq(schema.stocks.id, dto.stock_id))
      .limit(1)
    if (!stock) throw new NotFoundException(`股票 ${dto.stock_id} 不存在`)
    if (stock.user_id !== uid) throw new NotFoundException(`股票 ${dto.stock_id} 不存在`)

    const type = dto.type ?? NoteType.NOTE
    const isDoc = type === NoteType.DOC

    const renderedHtml = isDoc && dto.doc_md ? this.renderMarkdown(dto.doc_md) : dto.content ?? null

    const [row] = await this.db
      .insert(schema.notes)
      .values({
        user_id: uid,
        stock_id: dto.stock_id,
        stock_code: stock.code,
        stock_name: stock.name,
        type,
        title: dto.title,
        content: renderedHtml,
        doc_md: isDoc ? dto.doc_md ?? null : null,
        direction: isDoc ? null : (dto.direction ?? 'neutral'),
        entry_price: isDoc ? null : (dto.entry_price != null ? String(dto.entry_price) : null),
        target_price: isDoc ? null : (dto.target_price != null ? String(dto.target_price) : null),
        stop_loss: isDoc ? null : (dto.stop_loss != null ? String(dto.stop_loss) : null),
        tags: isDoc ? [] : (dto.tags ?? []),
        event: isDoc ? null : (dto.related_event ?? null),
        source: isDoc ? null : (dto.source ?? null),
        images: isDoc ? [] : (dto.images ?? []),
        ai_summary: dto.ai_summary ?? null,
      })
      .returning()
    return row
  }

  async update(uid: string, id: string, dto: UpdateNoteDto) {
    const existing = await this.getById(uid, id)
    const isDoc = existing.type === NoteType.DOC

    const setObj: Record<string, any> = { updated_at: new Date() }
    if (dto.title !== undefined) setObj.title = dto.title
    if (dto.content !== undefined && !isDoc) setObj.content = dto.content
    if (dto.doc_md !== undefined && isDoc) {
      setObj.doc_md = dto.doc_md
      setObj.content = this.renderMarkdown(dto.doc_md)
    }
    if (!isDoc) {
      if (dto.direction !== undefined) setObj.direction = dto.direction
      if (dto.entry_price !== undefined) setObj.entry_price = String(dto.entry_price)
      if (dto.target_price !== undefined) setObj.target_price = String(dto.target_price)
      if (dto.stop_loss !== undefined) setObj.stop_loss = String(dto.stop_loss)
      if (dto.tags !== undefined) setObj.tags = dto.tags
      if (dto.related_event !== undefined) setObj.event = dto.related_event
      if (dto.source !== undefined) setObj.source = dto.source
      if (dto.images !== undefined) setObj.images = dto.images
    }
    if (dto.ai_summary !== undefined) setObj.ai_summary = dto.ai_summary

    const [row] = await this.db
      .update(schema.notes)
      .set(setObj)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.user_id, uid)))
      .returning()
    return row
  }

  async remove(uid: string, id: string) {
    await this.getById(uid, id)
    await this.db
      .delete(schema.notes)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.user_id, uid)))
    return { id, deleted: true }
  }

  async heatmap(uid: string, fromDays = 365) {
    const since = new Date()
    since.setDate(since.getDate() - fromDays)

    const rows = await this.db
      .select({
        day: sql<string>`to_char(${schema.notes.created_at}, 'YYYY-MM-DD')`.as('day'),
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.notes)
      .where(and(eq(schema.notes.user_id, uid), gte(schema.notes.created_at, since)))
      .groupBy(sql`day`)
      .orderBy(asc(sql`day`))

    const map: Record<string, number> = {}
    let total = 0
    let activeDays = 0
    rows.forEach((r) => {
      map[r.day] = Number(r.count)
      total += Number(r.count)
      if (Number(r.count) > 0) activeDays += 1
    })
    return { data: map, total, activeDays, fromDays }
  }

  async distributionByStock(uid: string, stock_id: string) {
    const rows = await this.db
      .select({
        direction: schema.notes.direction,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.notes)
      .where(and(eq(schema.notes.stock_id, stock_id), eq(schema.notes.user_id, uid)))
      .groupBy(schema.notes.direction)

    const map: Record<string, number> = { bull: 0, bear: 0, neutral: 0 }
    rows.forEach((r) => {
      if (r.direction in map) map[r.direction] = Number(r.count)
    })
    return map
  }

  async summary(uid: string, stock_id: string) {
    const rows = await this.db
      .select({
        avg_entry: sql<number>`avg(${schema.notes.entry_price})`.as('avg_entry'),
        avg_target: sql<number>`avg(${schema.notes.target_price})`.as('avg_target'),
        avg_stop: sql<number>`avg(${schema.notes.stop_loss})`.as('avg_stop'),
        total: sql<number>`count(*)::int`.as('total'),
      })
      .from(schema.notes)
      .where(and(eq(schema.notes.stock_id, stock_id), eq(schema.notes.user_id, uid)))

    const r = rows[0] || {}
    return {
      total: Number(r.total ?? 0),
      avg_entry_price: r.avg_entry ? Number(r.avg_entry) : null,
      avg_target_price: r.avg_target ? Number(r.avg_target) : null,
      avg_stop_loss: r.avg_stop ? Number(r.avg_stop) : null,
    }
  }

  /** 客户端预览用：纯函数 markdown → HTML,存库时也会调用 */
  renderMarkdown(md: string): string {
    const raw = marked.parse(md ?? '', { async: false }) as string
    return DOMPurify.sanitize(raw)
  }

  /** 控制器层暴露：接收 md 字符串,返回 html */
  async renderMd(dto: RenderMdDto) {
    return { html: this.renderMarkdown(dto.md) }
  }
}
