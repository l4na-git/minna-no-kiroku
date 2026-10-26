import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { write, type AppDb } from './client';
import { ConflictError } from './errors';
import { categories } from './schema';
import { requireUser } from './users';
import { validateCategoryName } from './validation';

export const INITIAL_CATEGORIES = ['物忘れ', '思い込み', 'その他'] as const;

export type Category = { id: string; name: string; sortOrder: number };

const columns = { id: categories.id, name: categories.name, sortOrder: categories.sortOrder };

function nextSortOrder(db: AppDb['db']): number {
  const row = db
    .select({ n: sql<number>`COALESCE(MAX(${categories.sortOrder}), -1) + 1` })
    .from(categories)
    .get();
  return row?.n ?? 0;
}

/** 初期カテゴリを作る。再起動しても重複しない。空の DB では sort_order が 0, 1, 2 になる。 */
export function seedCategories(d: AppDb): void {
  write(d, (db) => {
    for (const name of INITIAL_CATEGORIES) {
      const found = db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).get();
      if (found) continue;
      db.insert(categories)
        .values({ id: randomUUID(), name, sortOrder: nextSortOrder(db), createdBy: null, createdAt: d.now() })
        .run();
    }
  });
}

/** 表示順(sort_order)で返す。 */
export function listCategories(d: AppDb, userId: string): Category[] {
  requireUser(d, userId);
  return d.db.select(columns).from(categories).orderBy(asc(categories.sortOrder)).all();
}

/** 認証済み利用者がカテゴリを追加する。前後の空白は除き、同名なら ConflictError。 */
export function createCategory(d: AppDb, userId: string, name: unknown): Category {
  const clean = validateCategoryName(name);
  return write(d, (db) => {
    const me = requireUser(d, userId);
    const dup = db.select({ id: categories.id }).from(categories).where(eq(categories.name, clean)).get();
    if (dup) throw new ConflictError('duplicate_category', '同じ名前のカテゴリがあります');
    const created = { id: randomUUID(), name: clean, sortOrder: nextSortOrder(db) };
    db.insert(categories).values({ ...created, createdBy: me.id, createdAt: d.now() }).run();
    return created;
  });
}
