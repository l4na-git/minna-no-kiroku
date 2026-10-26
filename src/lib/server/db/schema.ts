import { desc, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SQL の正は migrations/*.sql。ここは Drizzle で型付きに扱うための定義で、docs/data-model.md と揃える。
const WS = sql.raw('char(9,10,11,12,13,32,160,12288)');

export const PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Period = (typeof PERIODS)[number];

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    authSubject: text('auth_subject').notNull().unique(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    color: integer('color').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    check('users_auth_subject_check', sql`length(${t.authSubject}) > 0`),
    check('users_email_check', sql`length(${t.email}) > 0 AND ${t.email} = lower(${t.email})`),
    check(
      'users_display_name_check',
      sql`length(trim(${t.displayName}, ${WS})) >= 1 AND length(${t.displayName}) <= 20`
    ),
    check('users_color_check', sql`${t.color} BETWEEN 0 AND 5`)
  ]
);

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    sortOrder: integer('sort_order').notNull().unique(),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    check(
      'categories_name_check',
      sql`${t.name} = trim(${t.name}, ${WS}) AND length(${t.name}) BETWEEN 1 AND 20`
    ),
    check('categories_sort_order_check', sql`${t.sortOrder} >= 0`)
  ]
);

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    eventDate: text('event_date').notNull(),
    eventPeriod: text('event_period', { enum: PERIODS }),
    createdAt: integer('created_at').notNull(),
    editedAt: integer('edited_at')
  },
  (t) => [
    check(
      'entries_body_check',
      sql`length(trim(${t.body}, ${WS})) >= 1 AND length(${t.body}) <= 10000`
    ),
    check(
      'entries_event_date_check',
      sql`${t.eventDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.eventDate}, '+0 days') IS ${t.eventDate}`
    ),
    check(
      'entries_event_period_check',
      sql`${t.eventPeriod} IN ('morning', 'afternoon', 'evening', 'night')`
    ),
    index('entries_by_event_date').on(desc(t.eventDate), desc(t.createdAt), desc(t.id))
  ]
);
