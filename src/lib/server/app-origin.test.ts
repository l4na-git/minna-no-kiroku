import { afterEach, describe, expect, it, vi } from 'vitest';
import { appOriginMatchesBuild, builtAppOrigin, buildTimeAppOrigin } from './app-origin';

const origin = 'https://records.example.com';

afterEach(() => vi.unstubAllGlobals());

describe('公開URLのビルド時設定', () => {
  it('本番ビルドでは正しい値だけを受け付け、不正な値はビルドを失敗させる', () => {
    expect(buildTimeAppOrigin('build', origin)).toBe(origin);
    for (const value of ['http://records.example.com', `${origin}/`, `${origin}/path`, `${origin}:443`, ` ${origin}`, 'records.example.com']) {
      expect(() => buildTimeAppOrigin('build', value), value).toThrow('APP_ORIGIN');
    }
  });

  it('未設定のビルドは許すが、埋め込む値は空にする', () => {
    expect(buildTimeAppOrigin('build', undefined)).toBeUndefined();
    expect(buildTimeAppOrigin('build', '')).toBeUndefined();
  });

  it('開発サーバーとテストでは、APP_ORIGINの有無・内容にかかわらず無視する', () => {
    for (const value of [undefined, '', origin, 'http://invalid', `${origin}/path`]) {
      expect(buildTimeAppOrigin('serve', value)).toBeUndefined();
    }
  });
});

describe('実行時の公開URLとビルド時の値の一致', () => {
  it('埋め込まれた値がなければ、どの実行時の値でも一致しない', () => {
    expect(builtAppOrigin()).toBeUndefined();
    expect(appOriginMatchesBuild(origin)).toBe(false);
    vi.stubGlobal('__BUILT_APP_ORIGIN__', '');
    expect(builtAppOrigin()).toBeUndefined();
    expect(appOriginMatchesBuild(origin)).toBe(false);
  });

  it('同じ値だけを一致とみなす', () => {
    vi.stubGlobal('__BUILT_APP_ORIGIN__', origin);
    expect(builtAppOrigin()).toBe(origin);
    expect(appOriginMatchesBuild(origin)).toBe(true);
    for (const value of [undefined, '', 'https://other.example.com', `${origin}/`, 'http://records.example.com']) {
      expect(appOriginMatchesBuild(value), String(value)).toBe(false);
    }
  });
});
