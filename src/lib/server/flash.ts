import type { Cookies } from '@sveltejs/kit';

export const FLASH_COOKIE = 'flash';

/** Cookie に入れるのは種別だけで、表示する文言はサーバー側のこの表から引く。 */
const messages = {
  saved: '記録を保存しました',
  updated: '記録を更新しました',
  deleted: '記録を削除しました'
} as const;

export type FlashKind = keyof typeof messages;

/** 直後の 1 回の表示だけに使う。JavaScript が使えなくても、303 の先の画面で読めるようにする。 */
export function setFlash(cookies: Cookies, kind: FlashKind): void {
  cookies.set(FLASH_COOKIE, kind, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 });
}

/** 通知の文言を取り出し、Cookie は必ず消す。未知の値は表示しない。 */
export function takeFlash(cookies: Cookies): string | null {
  const kind = cookies.get(FLASH_COOKIE);
  if (kind === undefined) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  return Object.hasOwn(messages, kind) ? messages[kind as FlashKind] : null;
}
