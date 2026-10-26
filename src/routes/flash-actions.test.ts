import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { createEntry, findOrCreateUser, listCategories, openDatabase, type AppDb } from '#lib/server/db/index.ts';

const database = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('#lib/server/db/index.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/server/db/index.ts')>()),
  getDb: () => database.current
}));

import { actions as newActions } from './entries/new/+page.server';
import { actions as detailActions } from './entries/[id]/+page.server';
import { actions as editActions } from './entries/[id]/edit/+page.server';

let db: AppDb;
const fakeCookies = () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() });
const form = (fields: Record<string, string>) => new Request('http://localhost/', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields)
});
const today = () => db.today();

beforeEach(() => {
  db = openDatabase({ path: ':memory:', timeZone: 'Asia/Tokyo' });
  database.current = db;
});
afterEach(() => db.close());

const author = () => findOrCreateUser(db, { subject: 'author', email: 'author@example.com' });
const other = () => findOrCreateUser(db, { subject: 'other', email: 'other@example.com' });
const categoryId = () => listCategories(db, author().id)[0].id;
// delete は同期関数で redirect を同期的に投げるため、async に包んで非同期の action と同じ形で扱う
const run = async <T>(action: (event: never) => T, event: Record<string, unknown>) => action(event as never);

describe('成功したときだけ通知のCookieを設定する', () => {
  it('記録の保存に成功したら saved を設定して303で戻す', async () => {
    const cookies = fakeCookies();
    await expect(run(newActions.save!, {
      request: form({ body: '本文', eventDate: today(), categoryId: categoryId() }), locals: { user: author() }, cookies
    })).rejects.toMatchObject({ status: 303, location: '/' });
    expect(cookies.set).toHaveBeenCalledWith('flash', 'saved', expect.objectContaining({ httpOnly: true, sameSite: 'strict' }));
  });

  it('入力エラーで保存できなかったときは設定しない(エラー表示を優先する)', async () => {
    const cookies = fakeCookies();
    const result = await run(newActions.save!, {
      request: form({ body: '   ', eventDate: today(), categoryId: categoryId() }), locals: { user: author() }, cookies
    });
    expect(result).toMatchObject({ status: 400 });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it('記録の更新に成功したら updated を設定し、競合や他人の記録では設定しない', async () => {
    const a = author();
    const entry = createEntry(db, a.id, { body: '元', eventDate: today(), categoryId: categoryId() });
    const fields = { body: '直した', eventDate: today(), categoryId: categoryId(), version: String(entry.createdAt) };

    const stale = fakeCookies();
    expect(await run(editActions.save!, {
      request: form({ ...fields, version: String(entry.createdAt - 1) }), locals: { user: a }, params: { id: entry.id }, cookies: stale
    })).toMatchObject({ status: 409 });
    expect(stale.set).not.toHaveBeenCalled();

    const forbidden = fakeCookies();
    expect(await run(editActions.save!, {
      request: form(fields), locals: { user: other() }, params: { id: entry.id }, cookies: forbidden
    })).toMatchObject({ status: 403 });
    expect(forbidden.set).not.toHaveBeenCalled();

    const ok = fakeCookies();
    await expect(run(editActions.save!, {
      request: form(fields), locals: { user: a }, params: { id: entry.id }, cookies: ok
    })).rejects.toMatchObject({ status: 303, location: `/entries/${entry.id}` });
    expect(ok.set).toHaveBeenCalledWith('flash', 'updated', expect.any(Object));
  });

  it('記録の削除に成功したら deleted を設定し、他人の記録や存在しない記録では設定しない', async () => {
    const a = author();
    const entry = createEntry(db, a.id, { body: '消す', eventDate: today(), categoryId: categoryId() });

    const forbidden = fakeCookies();
    expect(await run(detailActions.delete!, { locals: { user: other() }, params: { id: entry.id }, cookies: forbidden })).toMatchObject({ status: 403 });
    expect(forbidden.set).not.toHaveBeenCalled();

    const ok = fakeCookies();
    await expect(run(detailActions.delete!, { locals: { user: a }, params: { id: entry.id }, cookies: ok }))
      .rejects.toMatchObject({ status: 303, location: '/' });
    expect(ok.set).toHaveBeenCalledWith('flash', 'deleted', expect.any(Object));

    const missing = fakeCookies();
    expect(await run(detailActions.delete!, { locals: { user: a }, params: { id: entry.id }, cookies: missing })).toMatchObject({ status: 404 });
    expect(missing.set).not.toHaveBeenCalled();
  });

  it('カテゴリの追加では通知を出さない', async () => {
    const cookies = fakeCookies();
    await expect(run(newActions.category!, { request: form({ categoryName: '外出' }), locals: { user: author() }, cookies }))
      .rejects.toMatchObject({ status: 303 });
    expect(cookies.set).not.toHaveBeenCalled();
  });
});
