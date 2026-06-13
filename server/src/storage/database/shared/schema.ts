import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";

// 系统表（保留，禁止删除）
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

/**
 * 自选股：用户关注池
 */
export const stocks = pgTable(
  "stocks",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    industry: varchar("industry", { length: 100 }),
    current_price: numeric("current_price", { precision: 12, scale: 2 }),
    change_amount: numeric("change_amount", { precision: 12, scale: 2 }),
    change_percent: numeric("change_percent", { precision: 6, scale: 2 }),
    price_date: varchar("price_date", { length: 10 }), // YYYYMMDD
    open_price: numeric("open_price", { precision: 12, scale: 2 }),
    high_price: numeric("high_price", { precision: 12, scale: 2 }),
    low_price: numeric("low_price", { precision: 12, scale: 2 }),
    pre_close: numeric("pre_close", { precision: 12, scale: 2 }),
    volume: numeric("volume", { precision: 18, scale: 0 }),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    last_sync_at: timestamp("last_sync_at", { withTimezone: true }),
    note: text("note"),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stocks_code_idx").on(table.code),
    index("stocks_created_at_idx").on(table.created_at),
  ],
);

/**
 * 投资观点/文档：用户记录的多模态观点（type=note）或 MD 文档（type=doc）
 */
export const notes = pgTable(
  "notes",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stock_id: varchar("stock_id", { length: 36 })
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    stock_code: varchar("stock_code", { length: 20 }).notNull(),
    stock_name: varchar("stock_name", { length: 100 }).notNull(),
    type: varchar("type", { length: 10 }).notNull().default("note"), // note / doc
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").default("").notNull(),
    doc_md: text("doc_md"), // 文档模式的原始 markdown 源
    direction: varchar("direction", { length: 10 }).default("neutral"), // bull / bear / neutral (docs 可空)
    entry_price: numeric("entry_price", { precision: 12, scale: 2 }),
    target_price: numeric("target_price", { precision: 12, scale: 2 }),
    stop_loss: numeric("stop_loss", { precision: 12, scale: 2 }),
    tags: text("tags")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    event: text("event"),
    source: text("source"),
    images: jsonb("images")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    ai_summary: text("ai_summary"),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notes_stock_id_idx").on(table.stock_id),
    index("notes_direction_idx").on(table.direction),
    index("notes_type_idx").on(table.type),
    index("notes_created_at_idx").on(table.created_at),
  ],
);

/**
 * 股票日线历史：Tushare daily 接口同步写入
 */
export const stockPrices = pgTable(
  "stock_prices",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stock_id: varchar("stock_id", { length: 36 })
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    trade_date: varchar("trade_date", { length: 10 }).notNull(), // YYYYMMDD
    open_price: numeric("open_price", { precision: 12, scale: 2 }),
    high_price: numeric("high_price", { precision: 12, scale: 2 }),
    low_price: numeric("low_price", { precision: 12, scale: 2 }),
    close_price: numeric("close_price", { precision: 12, scale: 2 }),
    pre_close: numeric("pre_close", { precision: 12, scale: 2 }),
    change_amount: numeric("change_amount", { precision: 12, scale: 2 }),
    change_percent: numeric("change_percent", { precision: 6, scale: 2 }),
    volume: numeric("volume", { precision: 18, scale: 0 }),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stock_prices_stock_id_idx").on(table.stock_id),
    index("stock_prices_trade_date_idx").on(table.trade_date),
  ],
);

/**
 * AI 报告：单图解读 / 跨观点报告
 */
export const aiReports = pgTable(
  "ai_reports",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stock_id: varchar("stock_id", { length: 36 }).references(
      () => stocks.id,
      { onDelete: "set null" },
    ),
    stock_code: varchar("stock_code", { length: 20 }),
    stock_name: varchar("stock_name", { length: 100 }),
    type: varchar("type", { length: 20 }).notNull(), // image_understand / cross_view
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending / done / failed
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_reports_stock_id_idx").on(table.stock_id),
    index("ai_reports_type_idx").on(table.type),
    index("ai_reports_created_at_idx").on(table.created_at),
  ],
);

export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type AiReport = typeof aiReports.$inferSelect;
export type NewAiReport = typeof aiReports.$inferInsert;
export type StockPrice = typeof stockPrices.$inferSelect;
export type NewStockPrice = typeof stockPrices.$inferInsert;
