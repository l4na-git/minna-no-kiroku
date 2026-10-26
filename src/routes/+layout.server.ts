import { takeFlash } from '#lib/server/flash.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, url }) => {
  // 画面を移るたびに読み直し、一度表示した通知が次の画面に残らないようにする。
  void url.href;
  return { flash: takeFlash(cookies) };
};
