import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { write, type AppDb } from './client';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { categories, entries, users, type Period } from './schema';
import { requireUser } from './users';
import {
  validateBody,
  validateDate,
  validateEventDate,
  validatePeriod,
  validateUuid
} from './validation';

export type EntryView = {
  id: string;
  body: string;
  eventDate: string;
  eventPeriod: Period | null;
  categoryId: string;
  category: string;
  createdAt: number;
  editedAt: number | null;
  authorId: string;
  authorName: string;
  authorColor: number;
  /** 呼び出した利用者が書いた記録か。編集・削除ボタンの表示に使う(権限の判定自体は SQL で行う)。 */
  isMine: boolean;
};

export type EntryInput = {
  body: unknown;
  eventDate: unknown;
  eventPeriod?: unknown;
  categoryId: unknown;
};

const select = {
  id: entries.id,
  body: entries.body,
  eventDate: entries.eventDate,
  eventPeriod: entries.eventPeriod,
  categoryId: entries.categoryId,
  category: categories.name,
  createdAt: entries.createdAt,
  editedAt: entries.editedAt,
  authorId: entries.authorId,
  authorName: users.displayName,
  authorColor: users.color
};

function view(row: Omit<EntryView, 'isMine'>, me: string): EntryView {
  return { ...row, isMine: row.authorId === me };
}

function base(db: AppDb['db']) {
  return db
    .select(select)
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .innerJoin(users, eq(users.id, entries.authorId));
}

function validateInput(d: AppDb, input: EntryInput) {
  return {
    body: validateBody(input.body),
    eventDate: validateEventDate(input.eventDate, d.today()),
    eventPeriod: validatePeriod(input.eventPeriod),
    categoryId: validateUuid('categoryId', input.categoryId)
  };
}

function requireCategory(db: AppDb['db'], id: string) {
  const c = db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).get();
  if (!c) throw new ValidationError('categoryId', 'カテゴリが見つかりません');
}

/** 記録を保存する。author_id は呼び出した本人、created_at はシステムが入れる。 */
export function createEntry(d: AppDb, userId: string, input: EntryInput): EntryView {
  const v = validateInput(d, input);
  return write(d, (db) => {
    const me = requireUser(d, userId);
    requireCategory(db, v.categoryId);
    const id = randomUUID();
    db.insert(entries).values({ id, authorId: me.id, ...v, createdAt: d.now(), editedAt: null }).run();
    return view(base(db).where(eq(entries.id, id)).get()!, me.id);
  });
}

export function getEntry(d: AppDb, userId: string, entryId: unknown): EntryView | null {
  const me = requireUser(d, userId);
  const id = validateUuid('entryId', entryId);
  const row = base(d.db).where(eq(entries.id, id)).get();
  return row ? view(row, me.id) : null;
}

export type ListOptions = {
  /** 出来事の日付(YYYY-MM-DD)。両端を含む。省略すると下限なし。 */
  from?: unknown;
  /** 省略すると上限なし(「すべて」)。 */
  to?: unknown;
  /** 既定は新しい順。 */
  order?: 'desc' | 'asc';
};

/** 認証済み利用者は全記録を読める。出来事の日付→記録日時→ID の順で安定して並べる。 */
export function listEntries(d: AppDb, userId: string, options: ListOptions = {}): EntryView[] {
  const me = requireUser(d, userId);
  const from = options.from == null ? null : validateDate('from', options.from);
  const to = options.to == null ? null : validateDate('to', options.to);
  if (from && to && from > to) throw new ValidationError('from', '期間の始まりが終わりより後です');
  if (options.order !== undefined && options.order !== 'asc' && options.order !== 'desc')
    throw new ValidationError('order', '並び順が不正です');
  const dir = options.order === 'asc' ? asc : desc;

  const rows = base(d.db)
    .where(and(from ? gte(entries.eventDate, from) : undefined, to ? lte(entries.eventDate, to) : undefined))
    .orderBy(dir(entries.eventDate), dir(entries.createdAt), dir(entries.id))
    .all();
  return rows.map((r) => view(r, me.id));
}

/** 書いた本人だけが編集できる。条件は SQL の `author_id = :me`。created_at は変えず edited_at を入れる。 */
export function updateEntry(d: AppDb, userId: string, entryId: unknown, input: EntryInput, expectedVersion?: number): EntryView {
  const id = validateUuid('entryId', entryId);
  const v = validateInput(d, input);
  return write(d, (db) => {
    const me = requireUser(d, userId);
    requireCategory(db, v.categoryId);
    const current = base(db).where(eq(entries.id, id)).get();
    if (!current) throw new NotFoundError('記録が見つかりません');
    if (current.authorId !== me.id) throw new ForbiddenError('他の人の記録は編集・削除できません');
    const version = current.editedAt ?? current.createdAt;
    if (expectedVersion !== undefined && expectedVersion !== version)
      throw new ConflictError('stale_entry', '別の画面で記録が更新されました。入力内容を控えてから再読み込みしてください。');
    const res = db
      .update(entries)
      .set({ ...v, editedAt: Math.max(d.now(), version + 1) })
      .where(and(eq(entries.id, id), eq(entries.authorId, me.id)))
      .run();
    if (res.changes === 0) throw missingOrForbidden(db, id);
    return view(base(db).where(eq(entries.id, id)).get()!, me.id);
  });
}

/** 書いた本人だけが物理削除できる。 */
export function deleteEntry(d: AppDb, userId: string, entryId: unknown): void {
  const id = validateUuid('entryId', entryId);
  write(d, (db) => {
    const me = requireUser(d, userId);
    const res = db.delete(entries).where(and(eq(entries.id, id), eq(entries.authorId, me.id))).run();
    if (res.changes === 0) throw missingOrForbidden(db, id);
  });
}

function missingOrForbidden(db: AppDb['db'], id: string) {
  const exists = db.select({ id: entries.id }).from(entries).where(eq(entries.id, id)).get();
  return exists ? new ForbiddenError('他の人の記録は編集・削除できません') : new NotFoundError('記録が見つかりません');
}
