import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthenticationError, ConflictError, ForbiddenError, NotFoundError, ValidationError,
  createCategory, createEntry, deleteEntry, findOrCreateUser, getEntry, listCategories,
  listEntries, monthlyCategoryCounts, openDatabase, reassignAuthSubject, updateDisplayName,
  updateEntry, type AppDb
} from './index';
import { runMigrations } from './migrate';

let d: AppDb;
let t = Date.UTC(2026, 5, 15, 3, 0, 0); // 2026-06-15 12:00 JST
const tick = () => (t += 1000);

beforeEach(() => {
  d = openDatabase({ path: ':memory:', timeZone: 'Asia/Tokyo', now: tick });
});
afterEach(() => d.close());

const user = (n: number) =>
  findOrCreateUser(d, { subject: `sub-${n}`, email: `User${n}@Example.com` });
const cat = () => listCategories(d, user(1).id)[0].id;
const entry = (uid: string, over: Record<string, unknown> = {}) =>
  createEntry(d, uid, { body: '本文', eventDate: '2026-06-10', categoryId: cat(), ...over });

describe('接続とマイグレーション', () => {
  it('外部キー・busy_timeout が有効で、再実行しても何も起きない', () => {
    expect(d.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(d.sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(runMigrations(d.sqlite)).toEqual([]);
  });

  it('ファイル DB は WAL になる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiroku-'));
    try {
      const f = openDatabase({ path: join(dir, 'x', 'a.db') });
      expect(f.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
      f.close();
      openDatabase({ path: join(dir, 'x', 'a.db') }).close(); // 再起動
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('初期カテゴリは 0,1,2 の順で、再起動しても重複しない', () => {
    const cats = listCategories(d, user(1).id);
    expect(cats.map((c) => [c.name, c.sortOrder])).toEqual([['物忘れ', 0], ['思い込み', 1], ['その他', 2]]);
    const dir = mkdtempSync(join(tmpdir(), 'kiroku-'));
    try {
      const p = join(dir, 'a.db');
      openDatabase({ path: p }).close();
      const again = openDatabase({ path: p });
      expect(again.sqlite.prepare('SELECT count(*) n FROM categories').get()).toEqual({ n: 3 });
      expect(again.sqlite.prepare('SELECT created_by FROM categories').get()).toEqual({ created_by: null });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('DB の CHECK・外部キーが直接の書き込みも拒否する', () => {
    const u = user(1);
    const c = cat();
    const ins = (body: string, date: string, period: string | null, author = u.id, category = c) =>
      d.sqlite
        .prepare('INSERT INTO entries (id,author_id,category_id,body,event_date,event_period,created_at) VALUES (?,?,?,?,?,?,1)')
        .run(crypto.randomUUID(), author, category, body, date, period);
    expect(() => ins('　 \n', '2026-06-01', null)).toThrow(/CHECK/);
    expect(() => ins('x'.repeat(10001), '2026-06-01', null)).toThrow(/CHECK/);
    expect(() => ins('a', '2026-02-30', null)).toThrow(/CHECK/);
    expect(() => ins('a', '2026-6-1', null)).toThrow(/CHECK/);
    expect(() => ins('a', '2026-06-01', 'noon')).toThrow(/CHECK/);
    expect(() => ins('a', '2026-06-01', null, 'nobody')).toThrow(/FOREIGN KEY/);
    expect(() => ins('a', '2026-06-01', null, u.id, 'nocat')).toThrow(/FOREIGN KEY/);
    expect(() => ins('a', '2028-02-29', 'night')).not.toThrow();
    expect(() => d.sqlite.prepare('DELETE FROM categories WHERE id=?').run(c)).toThrow(/FOREIGN KEY/);
    expect(() => d.sqlite.prepare('DELETE FROM users WHERE id=?').run(u.id)).toThrow(/FOREIGN KEY/);
    expect(() => d.sqlite.prepare("INSERT INTO users VALUES ('x','sub-1','a@b','n',0,1)")).not.toThrow();
  });
});

describe('利用者', () => {
  it('作成: メールは小文字、表示名はユーザー名部分、色は登録順で 0〜5 を繰り返す', () => {
    const us = [1, 2, 3, 4, 5, 6, 7].map(user);
    expect(us[0]).toMatchObject({ email: 'user1@example.com', displayName: 'user1' });
    expect(us.map((u) => u.color)).toEqual([0, 1, 2, 3, 4, 5, 0]);
  });

  it('同じ sub は同じ利用者。メール変更は小文字で更新される', () => {
    const a = findOrCreateUser(d, { subject: 's', email: 'a@x.com' });
    const b = findOrCreateUser(d, { subject: 's', email: 'New@X.com' });
    expect(b.id).toBe(a.id);
    expect(b.email).toBe('new@x.com');
    expect(d.sqlite.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 1 });
  });

  it('初期表示名は 20 文字以内で、空なら代替名', () => {
    const long = findOrCreateUser(d, { subject: 'l', email: `${'あ'.repeat(30)}@x.com` });
    expect(Array.from(long.displayName)).toHaveLength(20);
    expect(findOrCreateUser(d, { subject: 'e', email: '@x.com' }).displayName).toBe('ユーザー');
  });

  it('空の sub・メールなし・不正な型を拒否する', () => {
    for (const c of [
      { subject: '', email: 'a@x.com' }, { subject: 's', email: '' },
      { subject: 's', email: 'noat' }, { subject: undefined, email: 'a@x.com' }, { subject: 5, email: 'a@x.com' }
    ])
      expect(() => findOrCreateUser(d, c)).toThrow(ValidationError);
  });

  it('新しい sub が既存メールと同じなら自動で紐付けない', () => {
    findOrCreateUser(d, { subject: 'old', email: 'a@x.com' });
    expect(() => findOrCreateUser(d, { subject: 'new', email: 'A@x.com' })).toThrow(ConflictError);
    expect(d.sqlite.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 1 });
  });

  it('sub の付け替えで id と記録の権限が維持され、重複は拒否される', () => {
    const a = user(1);
    const e = entry(a.id);
    user(2);
    expect(() => reassignAuthSubject(d, { userId: a.id, newSubject: 'sub-2' })).toThrow(ConflictError);
    expect(() => reassignAuthSubject(d, { userId: a.id, newSubject: '' })).toThrow(ValidationError);
    expect(() => reassignAuthSubject(d, { userId: crypto.randomUUID(), newSubject: 'z' })).toThrow(NotFoundError);
    reassignAuthSubject(d, { userId: a.id, newSubject: 'renewed' });
    const again = findOrCreateUser(d, { subject: 'renewed', email: 'user1@example.com' });
    expect(again.id).toBe(a.id);
    expect(() => deleteEntry(d, again.id, e.id)).not.toThrow();
    expect(d.sqlite.prepare('SELECT count(*) n FROM users').get()).toEqual({ n: 2 });
  });

  it('表示名の変更は過去の記録にも反映され、空白だけ・超過は拒否', () => {
    const a = user(1);
    const e = entry(a.id);
    updateDisplayName(d, a.id, '  はなこ　');
    expect(getEntry(d, a.id, e.id)!.authorName).toBe('はなこ');
    for (const bad of ['', ' 　 ', 'あ'.repeat(21), 1, null])
      expect(() => updateDisplayName(d, a.id, bad)).toThrow(ValidationError);
    expect(() => updateDisplayName(d, 'ghost', 'x')).toThrow(AuthenticationError);
  });
});

describe('カテゴリ', () => {
  it('追加は前後の空白を除き sort_order が最大値の次になる。重複・空・超過は拒否', () => {
    const a = user(1);
    const c = createCategory(d, a.id, '　外出 ');
    expect(c).toMatchObject({ name: '外出', sortOrder: 3 });
    expect(createCategory(d, a.id, '服薬').sortOrder).toBe(4);
    expect(() => createCategory(d, a.id, '外出')).toThrow(ConflictError);
    expect(() => createCategory(d, a.id, '物忘れ ')).toThrow(ConflictError);
    for (const bad of ['', '   ', '　', 'あ'.repeat(21), undefined])
      expect(() => createCategory(d, a.id, bad)).toThrow(ValidationError);
  });
  it('未認証は拒否する', () => {
    expect(() => listCategories(d, 'ghost')).toThrow(AuthenticationError);
    expect(() => createCategory(d, '', 'x')).toThrow(AuthenticationError);
  });
});

describe('記録', () => {
  it('保存すると author_id は本人、created_at は自動で入り、他の利用者も読める', () => {
    const a = user(1), b = user(2);
    const e = entry(a.id, { eventPeriod: 'morning' });
    expect(e).toMatchObject({ authorId: a.id, editedAt: null, eventPeriod: 'morning', isMine: true, category: '物忘れ' });
    expect(e.createdAt).toBeGreaterThan(0);
    expect(getEntry(d, b.id, e.id)).toMatchObject({ id: e.id, isMine: false, authorName: 'user1' });
    expect(getEntry(d, b.id, crypto.randomUUID())).toBeNull();
  });

  it('入力検証: 空・全角空白だけ・超過・不正日付・未来日・時間帯・カテゴリ', () => {
    const a = user(1);
    const bad = (over: Record<string, unknown>, field: string) => {
      try { entry(a.id, over); } catch (e) { expect(e).toBeInstanceOf(ValidationError); expect((e as ValidationError).field).toBe(field); return; }
      throw new Error(`拒否されなかった: ${field}`);
    };
    bad({ body: '' }, 'body');
    bad({ body: '　　\n' }, 'body');
    bad({ body: 'あ'.repeat(10001) }, 'body');
    bad({ body: 'a\0b' }, 'body');
    bad({ body: 123 }, 'body');
    bad({ eventDate: '2026-02-29' }, 'eventDate');
    bad({ eventDate: '2026-6-1' }, 'eventDate');
    bad({ eventDate: '2026-06-16' }, 'eventDate'); // 今日は 2026-06-15
    bad({ eventDate: undefined }, 'eventDate');
    bad({ eventPeriod: 'noon' }, 'eventPeriod');
    bad({ categoryId: 'x' }, 'categoryId');
    bad({ categoryId: crypto.randomUUID() }, 'categoryId');
    expect(entry(a.id, { eventDate: '2026-06-15', body: 'あ'.repeat(10000) }).eventPeriod).toBeNull();
    expect(entry(a.id, { eventDate: '2024-02-29' }).eventDate).toBe('2024-02-29');
  });

  it('今日の判定は表示タイムゾーンで行う(UTC では前日でも JST では翌日)', () => {
    const jst = openDatabase({ path: ':memory:', timeZone: 'Asia/Tokyo', now: () => Date.UTC(2026, 0, 1, 20, 0, 0) });
    expect(jst.today()).toBe('2026-01-02');
    jst.close();
  });

  it('編集・削除は本人だけ。他人は Forbidden、存在しなければ NotFound', () => {
    const a = user(1), b = user(2);
    const e = entry(a.id);
    const input = { body: '直した', eventDate: '2026-06-11', eventPeriod: 'night', categoryId: cat() };
    expect(() => updateEntry(d, b.id, e.id, input)).toThrow(ForbiddenError);
    expect(() => deleteEntry(d, b.id, e.id)).toThrow(ForbiddenError);
    expect(getEntry(d, a.id, e.id)!.body).toBe('本文');
    expect(() => updateEntry(d, a.id, crypto.randomUUID(), input)).toThrow(NotFoundError);
    expect(() => deleteEntry(d, a.id, crypto.randomUUID())).toThrow(NotFoundError);
    expect(() => deleteEntry(d, a.id, 'bad')).toThrow(ValidationError);

    const u = updateEntry(d, a.id, e.id, input);
    expect(u).toMatchObject({ body: '直した', eventPeriod: 'night', createdAt: e.createdAt });
    expect(u.editedAt).toBeGreaterThan(e.createdAt);
    deleteEntry(d, a.id, e.id);
    expect(getEntry(d, a.id, e.id)).toBeNull();
  });

  it('別画面で更新された記録を古い編集内容で上書きしない', () => {
    const a = user(1);
    const original = entry(a.id);
    const input = { body: '新しい内容', eventDate: '2026-06-11', eventPeriod: 'night', categoryId: cat() };
    const updated = updateEntry(d, a.id, original.id, input, original.createdAt);
    expect(updated.editedAt).toBeGreaterThan(original.createdAt);
    expect(() => updateEntry(d, a.id, original.id, { ...input, body: '古い内容' }, original.createdAt)).toThrow(ConflictError);
    expect(getEntry(d, a.id, original.id)?.body).toBe('新しい内容');
  });

  it('未認証・存在しない利用者は読み書きできない', () => {
    const a = user(1);
    const e = entry(a.id);
    for (const ghost of ['', 'ghost', undefined as unknown as string]) {
      expect(() => listEntries(d, ghost)).toThrow(AuthenticationError);
      expect(() => getEntry(d, ghost, e.id)).toThrow(AuthenticationError);
      expect(() => entry(ghost)).toThrow(AuthenticationError);
      expect(() => deleteEntry(d, ghost, e.id)).toThrow(AuthenticationError);
      expect(() => monthlyCategoryCounts(d, ghost, { fromMonth: '2026-06', toMonth: '2026-06' })).toThrow(AuthenticationError);
    }
    expect(getEntry(d, a.id, e.id)).not.toBeNull();
  });

  it('一覧: 期間は両端を含み、同日は記録日時→ID で安定し、古い順は全部 ASC', () => {
    const a = user(1);
    // 同一 created_at を作るため時計を固定する
    const fixed = openDatabase({ path: ':memory:', now: () => Date.UTC(2026, 5, 15) });
    const u = findOrCreateUser(fixed, { subject: 's', email: 'a@x.com' });
    const c = listCategories(fixed, u.id)[0].id;
    const mk = (date: string) => createEntry(fixed, u.id, { body: date, eventDate: date, categoryId: c });
    const dates = ['2026-05-31', '2026-06-01', '2026-06-01', '2026-06-01', '2026-06-10', '2026-06-15'].map(mk);
    const range = { from: '2026-06-01', to: '2026-06-10' };
    const desc = listEntries(fixed, u.id, range);
    expect(desc.map((e) => e.eventDate)).toEqual(['2026-06-10', '2026-06-01', '2026-06-01', '2026-06-01']);
    const sameDayIds = desc.slice(1).map((e) => e.id);
    expect(sameDayIds).toEqual([...sameDayIds].sort().reverse());
    const asc = listEntries(fixed, u.id, { ...range, order: 'asc' });
    expect(asc.map((e) => e.id)).toEqual(desc.map((e) => e.id).reverse());
    expect(listEntries(fixed, u.id)).toHaveLength(dates.length);
    expect(listEntries(fixed, u.id, { from: '2026-06-02', to: '2026-06-09' })).toHaveLength(0);
    expect(() => listEntries(fixed, u.id, { from: '2026-06-10', to: '2026-06-01' })).toThrow(ValidationError);
    expect(() => listEntries(fixed, u.id, { from: '2026-13-01' })).toThrow(ValidationError);
    fixed.close();
    expect(a.id).toBeTruthy();
  });

  it('記録の異なる作成時刻は古い順・新しい順で逆になる', () => {
    const a = user(1);
    const first = entry(a.id), second = entry(a.id);
    expect(listEntries(d, a.id).map((e) => e.id)).toEqual([second.id, first.id]);
    expect(listEntries(d, a.id, { order: 'asc' }).map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it('参照される利用者は、Access を外されても記録が残る(アプリに削除手段がない)', () => {
    const a = user(1);
    const e = entry(a.id);
    expect(getEntry(d, user(2).id, e.id)).not.toBeNull();
  });
});

describe('集計', () => {
  it('月×カテゴリの件数。0 件の月・カテゴリも含め、年またぎ・うるう日も数える', () => {
    const a = user(1);
    const [c0, c1] = listCategories(d, a.id);
    const mk = (date: string, categoryId: string) =>
      createEntry(d, a.id, { body: 'x', eventDate: date, categoryId });
    mk('2025-12-31', c0.id); mk('2026-01-01', c0.id); mk('2026-01-31', c1.id);
    mk('2026-01-15', c0.id); mk('2026-03-01', c1.id);
    const r = monthlyCategoryCounts(d, a.id, { fromMonth: '2025-12', toMonth: '2026-03' });
    expect(r.map((m) => m.month)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    const flat = (m: number) => r[m].categories.map((c) => c.count);
    expect(flat(0)).toEqual([1, 0, 0]);
    expect(flat(1)).toEqual([2, 1, 0]);
    expect(flat(2)).toEqual([0, 0, 0]);
    expect(flat(3)).toEqual([0, 1, 0]);
    expect(r[0].categories.map((c) => c.name)).toEqual(['物忘れ', '思い込み', 'その他']);
    expect(monthlyCategoryCounts(d, a.id, { fromMonth: '2026-01', toMonth: '2026-01' })).toHaveLength(1);
  });
  it('不正な月・逆順・長すぎる期間を拒否する', () => {
    const a = user(1);
    const q = (fromMonth: unknown, toMonth: unknown) => () => monthlyCategoryCounts(d, a.id, { fromMonth, toMonth });
    expect(q('2026-13', '2026-13')).toThrow(ValidationError);
    expect(q('2026-02', '2026-01')).toThrow(ValidationError);
    expect(q('1900-01', '2026-01')).toThrow(ValidationError);
    expect(q(undefined, '2026-01')).toThrow(ValidationError);
  });
});
