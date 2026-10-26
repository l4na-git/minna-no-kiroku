import { dev } from '$app/env';

/** 開発サーバー以外では、どの設定でも開発用ユーザーを許可しない。 */
export function developmentUser(mode: string | undefined) {
  if (mode !== 'development' || !dev) return null;
  return { subject: 'local-development', email: 'development@example.invalid' };
}
