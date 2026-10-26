import { PERIODS, type Period } from './schema';
import { ValidationError } from './errors';

// SQLite の trim(..., char(9,10,11,12,13,32,160,12288)) と同じ集合
const EDGE_SPACE = /^[\t\n\v\f\r  　]+|[\t\n\v\f\r  　]+$/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = { body: 10_000, displayName: 20, categoryName: 20, subject: 512, email: 320 };

export function trimSpace(s: string): string {
  return s.replace(EDGE_SPACE, '');
}

/** SQLite の length() と同じく、文字（コードポイント）数で数える。 */
export function charLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function asString(field: string, v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError(field, `${field} が文字列ではありません`);
  // SQLite の length() は NUL で数えが止まるため、NUL は入れさせない
  if (v.includes('\0')) throw new ValidationError(field, `${field} に使えない文字があります`);
  return v;
}

function trimmedName(field: string, v: unknown, max: number): string {
  const s = trimSpace(asString(field, v));
  if (s.length === 0) throw new ValidationError(field, `${field} が空です`);
  if (charLength(s) > max) throw new ValidationError(field, `${field} は${max}文字以内です`);
  return s;
}

export const validateDisplayName = (v: unknown) =>
  trimmedName('displayName', v, LIMITS.displayName);
export const validateCategoryName = (v: unknown) =>
  trimmedName('categoryName', v, LIMITS.categoryName);

/** 本文は加工せずそのまま保存する。空白だけ・長すぎるものは拒否。 */
export function validateBody(v: unknown): string {
  const s = asString('body', v);
  if (trimSpace(s).length === 0) throw new ValidationError('body', '本文が空です');
  if (charLength(s) > LIMITS.body)
    throw new ValidationError('body', `本文は${LIMITS.body}文字以内です`);
  return s;
}

export function validateSubject(v: unknown): string {
  const s = asString('subject', v);
  if (s.length === 0 || s.length > LIMITS.subject)
    throw new ValidationError('subject', 'sub が不正です');
  return s;
}

export function validateEmail(v: unknown): string {
  const s = trimSpace(asString('email', v)).toLowerCase();
  if (s.length === 0 || s.length > LIMITS.email || !s.includes('@'))
    throw new ValidationError('email', 'メールアドレスが不正です');
  return s;
}

export function validateUuid(field: string, v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new ValidationError(field, `${field} が不正です`);
  return v;
}

/** YYYY-MM-DD の実在日か。 */
export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(y); // 0〜99年が1900年代に丸められないように
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateDate(field: string, v: unknown): string {
  if (typeof v !== 'string' || !isValidDate(v))
    throw new ValidationError(field, `${field} が実在する日付(YYYY-MM-DD)ではありません`);
  return v;
}

/** 出来事の日付。未来は拒否（today は表示タイムゾーンの今日）。 */
export function validateEventDate(v: unknown, today: string): string {
  const s = validateDate('eventDate', v);
  if (s > today) throw new ValidationError('eventDate', '未来の日付は選べません');
  return s;
}

export function validatePeriod(v: unknown): Period | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !(PERIODS as readonly string[]).includes(v))
    throw new ValidationError('eventPeriod', '時間帯が不正です');
  return v as Period;
}

export function validateMonth(field: string, v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v))
    throw new ValidationError(field, `${field} が YYYY-MM ではありません`);
  return v;
}
