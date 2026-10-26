import { sql } from 'drizzle-orm';
import type { AppDb } from './client';
import { ValidationError } from './errors';
import { categories, entries } from './schema';
import { requireUser } from './users';
import { validateMonth } from './validation';

export type MonthlyCounts = {
  /** YYYY-MM */
  month: string;
  /** 全カテゴリを sort_order 順に。件数 0 も含む。 */
  categories: { categoryId: string; name: string; sortOrder: number; count: number }[];
};

const MAX_MONTHS = 120;

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (out.length > MAX_MONTHS) throw new ValidationError('toMonth', `期間は${MAX_MONTHS}か月以内です`);
    if (++m > 12) (m = 1), y++;
  }
  return out;
}

/**
 * 出来事の月×カテゴリの件数(両端の月を含む)。解釈は加えず、件数 0 の月・カテゴリも返す。
 * 1 か月だけなら fromMonth と toMonth に同じ値を渡す。
 */
export function monthlyCategoryCounts(
  d: AppDb,
  userId: string,
  range: { fromMonth: unknown; toMonth: unknown }
): MonthlyCounts[] {
  requireUser(d, userId);
  const from = validateMonth('fromMonth', range.fromMonth);
  const to = validateMonth('toMonth', range.toMonth);
  if (from > to) throw new ValidationError('fromMonth', '期間の始まりが終わりより後です');
  const months = monthsBetween(from, to);

  const month = sql<string>`substr(${entries.eventDate}, 1, 7)`;
  const counted = d.db
    .select({ month, categoryId: entries.categoryId, n: sql<number>`count(*)` })
    .from(entries)
    .where(sql`${month} >= ${from} AND ${month} <= ${to}`)
    .groupBy(month, entries.categoryId)
    .all();
  const lookup = new Map(counted.map((r) => [`${r.month}|${r.categoryId}`, r.n]));

  const cats = d.db
    .select({ id: categories.id, name: categories.name, sortOrder: categories.sortOrder })
    .from(categories)
    .orderBy(categories.sortOrder)
    .all();
  return months.map((m) => ({
    month: m,
    categories: cats.map((c) => ({
      categoryId: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      count: lookup.get(`${m}|${c.id}`) ?? 0
    }))
  }));
}
