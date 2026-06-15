import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  serial,
  boolean,
  index,
  uniqueIndex,
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
    user_id: uuid("user_id").notNull(),
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
    // 状态机字段(2026-06-14 改造)
    status: varchar("status", { length: 10 }).default("watching").notNull(),  // 'watching' | 'holding'
    entry_price: numeric("entry_price", { precision: 12, scale: 2 }),
    loss_rate: numeric("loss_rate", { precision: 5, scale: 2 }),  // 百分比 0-100
    entered_at: timestamp("entered_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stocks_user_id_idx").on(table.user_id),
    index("stocks_code_idx").on(table.code),
    index("stocks_created_at_idx").on(table.created_at),
    index("stocks_status_idx").on(table.status),
    uniqueIndex("stocks_user_code_uq").on(table.user_id, table.code),
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
    user_id: uuid("user_id").notNull(),
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
    source_ref: text("source_ref"),
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
    index("notes_user_id_idx").on(table.user_id),
    index("notes_stock_id_idx").on(table.stock_id),
    index("notes_direction_idx").on(table.direction),
    index("notes_type_idx").on(table.type),
    index("notes_created_at_idx").on(table.created_at),
    uniqueIndex("notes_user_source_ref_uq").on(table.user_id, table.source, table.source_ref),
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
    user_id: uuid("user_id").notNull(),
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
    index("stock_prices_user_id_idx").on(table.user_id),
    index("stock_prices_stock_id_idx").on(table.stock_id),
    index("stock_prices_trade_date_idx").on(table.trade_date),
    uniqueIndex("stock_prices_user_stock_date_uq").on(
      table.user_id,
      table.stock_id,
      table.trade_date,
    ),
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
    user_id: uuid("user_id").notNull(),
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
    index("ai_reports_user_id_idx").on(table.user_id),
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

/**
 * 每日简评结构化缓存(2026-06-14 改造)
 * - signal:  green/yellow/red 3 色
 * - action:  hold/review/sell 操作建议
 * - evidence_note_ids: 引用让买入逻辑失效的 notes
 * - stop_loss_triggered: 是否被止损逻辑强制覆盖为 red
 */
export const stockBriefs = pgTable(
  "stock_briefs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    stock_id: varchar("stock_id", { length: 36 })
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    trade_date: varchar("trade_date", { length: 10 }).notNull(),  // YYYYMMDD
    signal: varchar("signal", { length: 10 }).notNull(),           // 'green' | 'yellow' | 'red'
    technical_analysis: text("technical_analysis").notNull().default(""),
    logic_judgment: text("logic_judgment").notNull().default(""),
    action: varchar("action", { length: 10 }).notNull(),            // 'hold' | 'review' | 'sell'
    sell_reasons: jsonb("sell_reasons").notNull().default(sql`'[]'::jsonb`),
    evidence_note_ids: uuid("evidence_note_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    price_at_brief: numeric("price_at_brief", { precision: 12, scale: 2 }),
    stop_loss_triggered: boolean("stop_loss_triggered")
      .notNull()
      .default(false),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stock_briefs_user_id_idx").on(table.user_id),
    index("stock_briefs_signal_idx").on(table.signal),
    index("stock_briefs_created_at_idx").on(table.created_at),
    uniqueIndex("stock_briefs_user_stock_date_uq").on(
      table.user_id,
      table.stock_id,
      table.trade_date,
    ),
  ],
);

export type StockBrief = typeof stockBriefs.$inferSelect;
export type NewStockBrief = typeof stockBriefs.$inferInsert;

/**
 * 错误监控日志(2026-06-14)
 * - NestJS 全局 5xx + cron 失败 + 手动 alert() 调用
 * - notified=true 表示已发送过告警邮件(避免重复)
 */
export const errorLogs = pgTable(
  "error_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    level: varchar("level", { length: 10 }).notNull(),     // 'error' | 'warn' | 'critical'
    source: varchar("source", { length: 50 }).notNull(),   // 'http' | 'cron-sync' | 'cron-brief' | 'manual'
    message: text("message").notNull(),
    stack: text("stack"),
    context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
    user_id: uuid("user_id"),
    notified: varchar("notified", { length: 1 })
      .notNull()
      .default("f"),  // 复用 stock_briefs 的 varchar(1) boolean 模式(避免 boolean 类型迁移)
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("error_logs_created_at_idx").on(table.created_at),
    index("error_logs_level_idx").on(table.level),
    index("error_logs_source_idx").on(table.source),
  ],
);

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;

/**
 * 笔记高亮(2026-06-15 改造)
 * - 以"渲染后纯文本"为坐标系,保存 start/end offset + selected/prefix/suffix text
 * - 文档编辑后由后端重定位,失效高亮在事务中删除
 * - source_hash 为最近一次重定位时的内容指纹,用于 409 冲突检测
 */
export const noteHighlights = pgTable(
  "note_highlights",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    note_id: varchar("note_id", { length: 36 })
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    selected_text: text("selected_text").notNull(),
    prefix_text: text("prefix_text").notNull().default(""),
    suffix_text: text("suffix_text").notNull().default(""),
    start_offset: integer("start_offset").notNull(),
    end_offset: integer("end_offset").notNull(),
    source_hash: varchar("source_hash", { length: 64 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("note_highlights_user_note_idx").on(
      table.user_id,
      table.note_id,
      table.start_offset,
    ),
    uniqueIndex("note_highlights_exact_uq").on(
      table.user_id,
      table.note_id,
      table.source_hash,
      table.start_offset,
      table.end_offset,
    ),
  ],
);

export type NoteHighlight = typeof noteHighlights.$inferSelect;
export type NewNoteHighlight = typeof noteHighlights.$inferInsert;
