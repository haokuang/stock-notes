import { Inject, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../storage/database/database.module';
import * as schema from '../storage/database/shared/schema';
import { desc, eq, asc, sql, like, or, and } from 'drizzle-orm';
import { CreateStockDto, UpdateStockDto } from './dto';
import { TushareService } from '../tushare/tushare.service';

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    private readonly tushare: TushareService,
  ) {}

  async list(keyword?: string) {
    const kw = keyword?.trim();
    if (kw) {
      return this.db
        .select()
        .from(schema.stocks)
        .where(or(like(schema.stocks.code, `%${kw}%`), like(schema.stocks.name, `%${kw}%`)))
        .orderBy(asc(schema.stocks.sort_order), desc(schema.stocks.created_at));
    }
    return this.db
      .select()
      .from(schema.stocks)
      .orderBy(asc(schema.stocks.sort_order), desc(schema.stocks.created_at));
  }

  async getById(id: string) {
    const [row] = await this.db.select().from(schema.stocks).where(eq(schema.stocks.id, id)).limit(1);
    if (!row) throw new NotFoundException(`股票 ${id} 不存在`);
    return row;
  }

  async getByCode(code: string) {
    const [row] = await this.db.select().from(schema.stocks).where(eq(schema.stocks.code, code)).limit(1);
    if (!row) throw new NotFoundException(`股票 ${code} 不存在`);
    return row;
  }

  async create(dto: CreateStockDto) {
    const existing = await this.db
      .select({ id: schema.stocks.id })
      .from(schema.stocks)
      .where(eq(schema.stocks.code, dto.code))
      .limit(1);
    if (existing.length) throw new ConflictException(`股票 ${dto.code} 已在自选股中`);

    const tsCode = this.toTushareCode(dto.code);
    const basic = await this.tushare.getStockBasic(tsCode);

    const [row] = await this.db
      .insert(schema.stocks)
      .values({
        code: dto.code,
        name: basic?.name ?? dto.name,
        industry: basic?.industry ?? dto.industry ?? null,
        current_price: dto.currentPrice != null ? String(dto.currentPrice) : null,
        change_amount: dto.changeAmount != null ? String(dto.changeAmount) : null,
        change_percent: dto.changePct != null ? String(dto.changePct) : null,
        sort_order: dto.sortOrder ?? 0,
      })
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateStockDto) {
    const existing = await this.getById(id);
    const [row] = await this.db
      .update(schema.stocks)
      .set({
        name: dto.name ?? existing.name,
        industry: dto.industry ?? existing.industry,
        current_price: dto.currentPrice != null ? String(dto.currentPrice) : existing.current_price,
        change_amount: dto.changeAmount != null ? String(dto.changeAmount) : existing.change_amount,
        change_percent: dto.changePct != null ? String(dto.changePct) : existing.change_percent,
        sort_order: dto.sortOrder ?? existing.sort_order,
        updated_at: new Date(),
      })
      .where(eq(schema.stocks.id, id))
      .returning();
    return row;
  }

  async remove(id: string) {
    await this.getById(id);
    await this.db.delete(schema.stocks).where(eq(schema.stocks.id, id));
    return { id, deleted: true };
  }

  async summary() {
    const [stockCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.stocks);
    const [noteCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notes);
    const [reportCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.aiReports);
    const bullCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notes)
      .where(and(eq(schema.notes.direction, 'bull'), eq(schema.notes.type, 'note')));
    return {
      stocks: stockCount?.count ?? 0,
      notes: noteCount?.count ?? 0,
      reports: reportCount?.count ?? 0,
      bull: bullCount[0]?.count ?? 0,
    };
  }

  private toTushareCode(code: string): string {
    const c = code.trim().toUpperCase();
    if (c.includes('.')) return c;
    if (/^(6|9|5|1)/.test(c)) return `${c}.SH`;
    if (/^(0|3|2)/.test(c)) return `${c}.SZ`;
    if (/^(4|8)/.test(c)) return `${c}.BJ`;
    return `${c}.SZ`;
  }
}
