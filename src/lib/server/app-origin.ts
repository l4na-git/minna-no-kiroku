import { validAppOrigin } from './cloudflare-access.ts';

/** vite build が埋め込む公開URL。dev・テストでは定義されない。 */
declare const __BUILT_APP_ORIGIN__: string | undefined;

export function builtAppOrigin(): string | undefined {
  return typeof __BUILT_APP_ORIGIN__ === 'string' && __BUILT_APP_ORIGIN__ ? __BUILT_APP_ORIGIN__ : undefined;
}

/** 本番ビルドのときだけ APP_ORIGIN を読む。不正な値はビルドを失敗させ、dev・テストでは無視する。 */
export function buildTimeAppOrigin(command: string, value: string | undefined): string | undefined {
  if (command !== 'build' || !value) return undefined;
  if (!validAppOrigin(value)) {
    throw new Error('APP_ORIGIN must be an exact HTTPS origin without a path or trailing slash');
  }
  return value;
}

/**
 * SvelteKit の CSRF 検査はビルド時の paths.origin で行われる。
 * 実行時の APP_ORIGIN がそれと一致しない、またはビルド時に未設定なら、フォームが 403 になるため利用を止める。
 */
export function appOriginMatchesBuild(runtime: string | undefined, built = builtAppOrigin()): boolean {
  return built !== undefined && validAppOrigin(runtime) && runtime === built;
}
