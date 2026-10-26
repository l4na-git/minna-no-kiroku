import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { FLASH_COOKIE, setFlash, takeFlash } from './flash';
import { load } from '../../routes/+layout.server';

const cookiesWith = (value?: string) => ({ get: vi.fn(() => value), set: vi.fn(), delete: vi.fn() }) as unknown as Cookies & {
  get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>;
};

describe('フラッシュ通知のCookie', () => {
  it('短命・同一サイト・HttpOnlyで、文言ではなく種別だけを入れる', () => {
    const cookies = cookiesWith();
    setFlash(cookies, 'saved');
    expect(cookies.set).toHaveBeenCalledOnce();
    const [name, value, options] = cookies.set.mock.calls[0];
    expect(name).toBe(FLASH_COOKIE);
    expect(value).toBe('saved');
    expect(options).toMatchObject({ path: '/', httpOnly: true, sameSite: 'strict' });
    expect(options.maxAge).toBeGreaterThan(0);
    expect(options.maxAge).toBeLessThanOrEqual(60);
  });

  it.each([
    ['saved', '記録を保存しました'],
    ['updated', '記録を更新しました'],
    ['deleted', '記録を削除しました']
  ])('%s は決まった文言になり、取り出すと同時にCookieを消す', (kind, message) => {
    const cookies = cookiesWith(kind);
    expect(takeFlash(cookies)).toBe(message);
    expect(cookies.delete).toHaveBeenCalledWith(FLASH_COOKIE, { path: '/' });
  });

  it('Cookieがなければ何も表示せず、消す操作もしない', () => {
    const cookies = cookiesWith(undefined);
    expect(takeFlash(cookies)).toBeNull();
    expect(cookies.delete).not.toHaveBeenCalled();
  });

  it.each(['<script>alert(1)</script>', '記録を削除しました', 'toString', '__proto__', ''])(
    '未知の値「%s」は文言として使わず、Cookieだけ消す', (value) => {
      const cookies = cookiesWith(value);
      expect(takeFlash(cookies)).toBeNull();
      expect(cookies.delete).toHaveBeenCalledWith(FLASH_COOKIE, { path: '/' });
    }
  );

  it('共通レイアウトのloadは、通知を一度だけ返してCookieを消す', () => {
    const cookies = cookiesWith('deleted');
    const event = { cookies, url: new URL('http://localhost/') } as unknown as Parameters<typeof load>[0];
    expect(load(event)).toEqual({ flash: '記録を削除しました' });
    expect(cookies.delete).toHaveBeenCalledOnce();
    expect(load({ ...event, cookies: cookiesWith(undefined) })).toEqual({ flash: null });
  });
});
