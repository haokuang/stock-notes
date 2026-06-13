import { Inject, Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../storage/database/database.module';
import * as schema from '../storage/database/shared/schema';
import { desc, eq, asc, sql, gte, and } from 'drizzle-orm';
import { CreateStockDto, UpdateStockDto } from './dto';
// import type

const TUSHARE_API = 'https://api.tushare.pro';

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: any) {}

  async list(keyword?: string) { const kw = keyword;
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
    const existing = await this.db.select({ id: schema.stocks.id }).from(schema.stocks).where(eq(schema.stocks.code, dto.code)).limit(1);
    if (existing.length) throw new ConflictException(`股票 ${dto.code} 已在自选股中`);

    const tushareData = await this.fetchTushareInfo(dto.code);

    const [row] = await this.db
      .insert(schema.stocks)
      .values({
        code: dto.code,
        name: dto.name,
        market: tushareData?.market ?? dto.market ?? 'CN',
        industry: tushareData?.industry ?? dto.industry ?? null,
        current_price: dto.currentPrice != null ? String(dto.currentPrice) : tushareData?.price ?? null,
        change_pct: dto.changePct != null ? String(dto.changePct) : tushareData?.changePct ?? null,
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
        change_pct: dto.changePct != null ? String(dto.changePct) : existing.change_pct,
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
    const [stockCount] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.stocks);
    const [noteCount] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.notes);
    const bullCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notes)
      .where(eq(schema.notes.direction, 'bull'));
    return {
      stocks: stockCount?.count ?? 0,
      notes: noteCount?.count ?? 0,
      bull: bullCount[0]?.count ?? 0,
    };
  }

  private async fetchTushareInfo(code: string): Promise<{ market: string; industry: string; price: string | null; changePct: string | null } | null> {
    const token = process.env.TUSHARE_TOKEN;
    if (!token) {
      this.logger.warn('TUSHARE_TOKEN 未配置，跳过行情拉取');
      return null;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(TUSHARE_API, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name: 'stock_basic',
          token,
          params: { ts_code: code },
          fields: 'industry,market,list_date',
        }),
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data: any = await res.json();
      if (data.code !== 0 || !data.data?.fields) return null;
      const fields: string[] = data.data.fields;
      const row: any[] = data.data.items?.[0] ?? [];
      if (!row.length) return null;
      const obj: Record<string, unknown> = {};
      fields.forEach((f, i) => (obj[f] = row[i]));
      return {
        market: String(obj.market ?? 'CN'),
        industry: String(obj.industry ?? ''),
        price: null,
        changePct: null,
      };
    } catch (err) {
      this.logger.warn(`Tushare 拉取失败: ${(err as Error).message}`);
      return null;
    }
  }
}
