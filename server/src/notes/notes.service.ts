import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB } from '../storage/database/database.module';
import * as schema from '../storage/database/shared/schema';
import { and, desc, eq, gte, lte, sql, asc } from 'drizzle-orm';
import { CreateNoteDto, UpdateNoteDto, QueryNoteDto } from './dto';
// import type

@Injectable()
export class NotesService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: any) {}

  async list(query: QueryNoteDto) {
    const conditions: any[] = [];
    if (query.stock_id) conditions.push(eq(schema.notes.stock_id, query.stock_id));
    if (query.direction) conditions.push(eq(schema.notes.direction, query.direction));
    if (query.from) conditions.push(gte(schema.notes.created_at, new Date(query.from)));
    if (query.to) conditions.push(lte(schema.notes.created_at, new Date(query.to)));

    const rows = await this.db
      .select({
        id: schema.notes.id,
        stock_id: schema.notes.stock_id,
        stock_code: schema.stocks.code,
        stock_name: schema.stocks.name,
        title: schema.notes.title,
        content: schema.notes.content,
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
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.notes.created_at))
      .limit(query.limit ?? 50)
      .offset(query.offset ?? 0);

    return rows;
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({
        id: schema.notes.id,
        stock_id: schema.notes.stock_id,
        stock_code: schema.stocks.code,
        stock_name: schema.stocks.name,
        title: schema.notes.title,
        content: schema.notes.content,
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
      .where(eq(schema.notes.id, id))
      .limit(1);
    if (!row) throw new NotFoundException(`观点 ${id} 不存在`);
    return row;
  }

  async create(dto: CreateNoteDto) {
    // 查 stock 信息，自动填充 stock_code/stock_name
    const [stock] = await this.db
      .select({ code: schema.stocks.code, name: schema.stocks.name })
      .from(schema.stocks)
      .where(eq(schema.stocks.id, dto.stock_id))
      .limit(1);
    if (!stock) throw new NotFoundException(`股票 ${dto.stock_id} 不存在`);

    const [row] = await this.db
      .insert(schema.notes)
      .values({
        stock_id: dto.stock_id,
        stock_code: stock.code,
        stock_name: stock.name,
        title: dto.title,
        content: dto.content,
        direction: dto.direction,
        entry_price: dto.entry_price != null ? String(dto.entry_price) : null,
        target_price: dto.target_price != null ? String(dto.target_price) : null,
        stop_loss: dto.stop_loss != null ? String(dto.stop_loss) : null,
        tags: dto.tags ?? [],
        event: dto.related_event ?? null,
        source: dto.source ?? null,
        images: dto.images ?? [],
        ai_summary: dto.ai_summary ?? null,
      })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateNoteDto) {
    await this.getById(id);
    const [row] = await this.db
      .update(schema.notes)
      .set({
        title: dto.title,
        content: dto.content,
        direction: dto.direction,
        entry_price: dto.entry_price != null ? String(dto.entry_price) : undefined,
        target_price: dto.target_price != null ? String(dto.target_price) : undefined,
        stop_loss: dto.stop_loss != null ? String(dto.stop_loss) : undefined,
        tags: dto.tags,
        event: dto.related_event,
        source: dto.source,
        images: dto.images,
        ai_summary: dto.ai_summary,
        updated_at: new Date(),
      })
      .where(eq(schema.notes.id, id))
      .returning();
    return row;
  }

  async remove(id: string) {
    await this.getById(id);
    await this.db.delete(schema.notes).where(eq(schema.notes.id, id));
    return { id, deleted: true };
  }

  async heatmap(fromDays = 365) {
    const since = new Date();
    since.setDate(since.getDate() - fromDays);

    const rows = await this.db
      .select({
        day: sql<string>`to_char(${schema.notes.created_at}, 'YYYY-MM-DD')`.as('day'),
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.notes)
      .where(gte(schema.notes.created_at, since))
      .groupBy(sql`day`)
      .orderBy(asc(sql`day`));

    const map: Record<string, number> = {};
    let total = 0;
    let activeDays = 0;
    rows.forEach((r) => {
      map[r.day] = Number(r.count);
      total += Number(r.count);
      if (Number(r.count) > 0) activeDays += 1;
    });
    return { data: map, total, activeDays, fromDays };
  }
  async distributionByStock(stock_id: string) {
    const rows = await this.db
      .select({
        direction: schema.notes.direction,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(schema.notes)
      .where(eq(schema.notes.stock_id, stock_id))
      .groupBy(schema.notes.direction);

    const map: Record<string, number> = { bull: 0, bear: 0, neutral: 0 };
    rows.forEach((r) => {
      if (r.direction in map) map[r.direction] = Number(r.count);
    });
    return map;
  }

  async summary(stock_id: string) {
    const rows = await this.db
      .select({
        avg_entry: sql<number>`avg(${schema.notes.entry_price})`.as('avg_entry'),
        avg_target: sql<number>`avg(${schema.notes.target_price})`.as('avg_target'),
        avg_stop: sql<number>`avg(${schema.notes.stop_loss})`.as('avg_stop'),
        total: sql<number>`count(*)::int`.as('total'),
      })
      .from(schema.notes)
      .where(eq(schema.notes.stock_id, stock_id));

    const r = rows[0] || {};
    return {
      total: Number(r.total ?? 0),
      avg_entry_price: r.avg_entry ? Number(r.avg_entry) : null,
      avg_target_price: r.avg_target ? Number(r.avg_target) : null,
      avg_stop_loss: r.avg_stop ? Number(r.avg_stop) : null,
    };
  }
}
