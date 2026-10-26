import { randomUUID } from 'node:crypto';
import { count, eq, ne, and } from 'drizzle-orm';
import { write, type AppDb } from './client';
import { AuthenticationError, ConflictError, NotFoundError } from './errors';
import { users } from './schema';
import {
  trimSpace,
  validateDisplayName,
  validateEmail,
  validateSubject,
  validateUuid
} from './validation';

export type User = {
  id: string;
  email: string;
  displayName: string;
  color: number;
  createdAt: number;
};

const columns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  color: users.color,
  createdAt: users.createdAt
};

/** 認証済みの利用者ID が実在することを確かめる。データを扱う側で毎回呼ぶ。 */
export function requireUser(d: AppDb, userId: unknown): User {
  if (typeof userId !== 'string' || userId.length === 0) throw new AuthenticationError();
  const u = d.db.select(columns).from(users).where(eq(users.id, userId)).get();
  if (!u) throw new AuthenticationError();
  return u;
}

export function getUser(d: AppDb, userId: string): User {
  return requireUser(d, userId);
}

/** メールアドレスのユーザー名部分から、20 文字以内の有効な初期表示名を作る。 */
export function defaultDisplayName(email: string): string {
  const local = trimSpace(email.split('@')[0] ?? '');
  const name = trimSpace(Array.from(local).slice(0, 20).join(''));
  return name.length > 0 ? name : 'ユーザー';
}

/**
 * 検証済み JWT の sub と email から利用者を引く。なければ作る。
 * - sub が一致すれば同じ利用者。メールが変わっていれば小文字にして更新する。
 * - sub が新しく、同じメールの既存利用者がいる場合は自動で紐付けず ConflictError。
 *   運用者が確認して reassignAuthSubject を使う。
 */
export function findOrCreateUser(d: AppDb, claims: { subject: unknown; email: unknown }): User {
  const subject = validateSubject(claims.subject);
  const email = validateEmail(claims.email);

  // 通常のリクエストは読み取りだけで済ませ、書き込みロックを取らない
  const existing = d.db.select(columns).from(users).where(eq(users.authSubject, subject)).get();
  if (existing && existing.email === email) return existing;

  return write(d, (db) => {
    const found = db.select(columns).from(users).where(eq(users.authSubject, subject)).get();
    if (found) {
      if (found.email !== email)
        db.update(users).set({ email }).where(eq(users.id, found.id)).run();
      return { ...found, email };
    }
    const sameEmail = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (sameEmail)
      throw new ConflictError(
        'email_in_use',
        '同じメールアドレスの利用者がすでにいます。運用者の確認が必要です'
      );
    const total = db.select({ n: count() }).from(users).get()?.n ?? 0;
    const created: User = {
      id: randomUUID(),
      email,
      displayName: defaultDisplayName(email),
      color: total % 6, // 登録順に 0〜5 を繰り返す。以後変えない
      createdAt: d.now()
    };
    db.insert(users)
      .values({ ...created, authSubject: subject })
      .run();
    return created;
  });
}

export function updateDisplayName(d: AppDb, userId: string, displayName: unknown): User {
  const name = validateDisplayName(displayName);
  return write(d, (db) => {
    const me = requireUser(d, userId);
    db.update(users).set({ displayName: name }).where(eq(users.id, me.id)).run();
    return { ...me, displayName: name };
  });
}

/**
 * 運用者用。Access の sub が変わったとき、本人確認のうえで既存利用者の auth_subject を付け替える。
 * id は変えないので、記録と編集権限は引き継がれる。ルートから呼ばないこと。
 */
export function reassignAuthSubject(d: AppDb, input: { userId: unknown; newSubject: unknown }): User {
  const userId = validateUuid('userId', input.userId);
  const newSubject = validateSubject(input.newSubject);
  return write(d, (db) => {
    const target = db.select(columns).from(users).where(eq(users.id, userId)).get();
    if (!target) throw new NotFoundError('利用者が見つかりません');
    const clash = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.authSubject, newSubject), ne(users.id, userId)))
      .get();
    if (clash) throw new ConflictError('subject_in_use', '新しい sub はすでに別の利用者が使っています');
    db.update(users).set({ authSubject: newSubject }).where(eq(users.id, userId)).run();
    return target;
  });
}
