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
 * 投资观点：用户记录的多模态观点
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
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").default("").notNull(),
    direction: varchar("direction", { length: 10 })
      .notNull()
      .default("neutral"), // bull / bear / neutral
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
    index("notes_created_at_idx").on(table.created_at),
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
