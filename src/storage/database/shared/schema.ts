import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  timestamp,
  text,
  varchar,
  index,
  boolean,
  integer,
} from "drizzle-orm/pg-core"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 新闻数据表
export const newsItems = pgTable(
  "news_items",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    category: varchar("category", { length: 64 }),
    region: varchar("region", { length: 64 }),
    sourceUrl: varchar("source_url", { length: 512 }),
    isActive: boolean("is_active").default(true).notNull(),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("news_category_idx").on(table.category),
    index("news_region_idx").on(table.region),
    index("news_crawled_at_idx").on(table.crawledAt),
  ]
);

// 爬取历史记录表
export const crawlHistory = pgTable(
  "crawl_history",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    status: varchar("status", { length: 32 }).notNull(),
    itemCount: integer("item_count").default(0),
    errorMessage: text("error_message"),
    crawledAt: timestamp("crawled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("crawl_status_idx").on(table.status),
    index("crawl_time_idx").on(table.crawledAt),
  ]
);

// 详细信号数据表（匹配 world-monitor 完整数据结构）
export const signals = pgTable(
  "signals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description"),
    location: varchar("location", { length: 256 }),
    country: varchar("country", { length: 128 }),
    priority: varchar("priority", { length: 32 }).default('NORMAL'),
    eventTime: varchar("event_time", { length: 128 }),
    updatedAt: varchar("updated_at", { length: 128 }),
    category: varchar("category", { length: 64 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("signals_priority_idx").on(table.priority),
    index("signals_country_idx").on(table.country),
    index("signals_category_idx").on(table.category),
    index("signals_active_idx").on(table.isActive),
  ]
);



