import { error, fail } from '@sveltejs/kit';
import type { Entry, EntryValues } from '../components/types';
import { DbError, getDb, getEntry, type Category, type EntryView } from './db';

export function displayEntry(entry: EntryView, categories: Category[]): Entry {
  return { ...entry, categoryName: entry.category, categoryOrder: categories.find((c) => c.id === entry.categoryId)?.sortOrder ?? 0 };
}

export function formError(cause: unknown, values?: EntryValues) {
  if (cause instanceof DbError) {
    const status = ({ invalid: 400, unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409 }[cause.code]) as 400 | 401 | 403 | 404 | 409;
    return fail(status, { error: cause.message, values });
  }
  throw cause;
}

export function requireEntry(userId: string, entryId: string, owner = false): EntryView {
  let entry: EntryView | null;
  try { entry = getEntry(getDb(), userId, entryId); }
  catch (cause) {
    if (cause instanceof DbError && cause.code === 'invalid') error(404, '記録が見つかりません');
    throw cause;
  }
  if (!entry) error(404, '記録が見つかりません');
  if (owner && entry.authorId !== userId) error(403, '自分の記録だけ編集できます');
  return entry;
}

export function readEntry(form: FormData) {
  return { body: form.get('body'), eventDate: form.get('eventDate'), eventPeriod: form.get('eventPeriod'), categoryId: form.get('categoryId') };
}

export function postedValues(form: FormData): EntryValues {
  const text = (key: string) => { const value = form.get(key); return typeof value === 'string' ? value : ''; };
  return { body: text('body'), eventDate: text('eventDate'), eventPeriod: text('eventPeriod') || null, categoryId: text('categoryId'), version: text('version') };
}
