import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit/hooks';
import { ConflictError, ValidationError } from './lib/server/db/errors';

const environment = vi.hoisted(() => ({ dev: true }));
const access = vi.hoisted(() => ({
  accessConfig: vi.fn(),
  verifyAccessToken: vi.fn(),
  validAppOrigin: (origin: string | undefined) => origin === 'https://records.example.com'
}));
const users = vi.hoisted(() => ({ findOrCreateUser: vi.fn() }));
vi.mock('$app/env', () => ({ get dev() { return environment.dev; } }));
vi.mock('./lib/server/db/client', () => ({ getDb: () => ({}) }));
vi.mock('./lib/server/db/users', () => ({ findOrCreateUser: users.findOrCreateUser }));
vi.mock('./lib/server/cloudflare-access', () => access);

import { handle } from './hooks.server';

describe('リクエストの認証', () => {
  const resolve = vi.fn(async () => new Response('開発用画面'));

  beforeEach(() => {
    vi.stubEnv('AUTH_MODE', 'development');
    environment.dev = true;
    resolve.mockClear();
    access.accessConfig.mockReturnValue({ issuer: 'https://example.cloudflareaccess.com', audience: 'test-audience' });
    access.verifyAccessToken.mockReset();
    users.findOrCreateUser.mockReset();
    users.findOrCreateUser.mockReturnValue({ id: 'development-user', displayName: '開発用ユーザー', email: 'development@example.invalid', color: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function request(headers: HeadersInit = {}) {
    const event = { locals: {}, request: new Request('http://localhost/', { headers }) };
    const response = await handle({ event, resolve } as unknown as Parameters<Handle>[0]);
    return { event, response };
  }

  it('開発サーバーで明示的に指定した場合は開発用ユーザーを設定する', async () => {
    const { event, response } = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(event.locals).toEqual({ user: { id: 'development-user', displayName: '開発用ユーザー', email: 'development@example.invalid', color: 0 } });
    expect(resolve).toHaveBeenCalledOnce();
  });

  it.each([undefined, '', 'cloudflare', 'Development', ' development', 'development '])(
    '開発用設定が不正な場合は拒否する: %s', async (mode) => {
      vi.stubEnv('AUTH_MODE', mode);
      const { response } = await request();
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(resolve).not.toHaveBeenCalled();
    }
  );

  it('本番ビルドでは開発用設定でも拒否する', async () => {
    environment.dev = false;
    const { response } = await request();
    expect(response.status).toBe(503);
    expect(resolve).not.toHaveBeenCalled();
  });

  function cloudflareMode(runtimeOrigin: string, builtOrigin?: string) {
    environment.dev = false;
    vi.stubEnv('AUTH_MODE', 'cloudflare');
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'https://example.cloudflareaccess.com');
    vi.stubEnv('CF_ACCESS_AUD', 'test-audience');
    vi.stubEnv('APP_ORIGIN', runtimeOrigin);
    if (builtOrigin !== undefined) vi.stubGlobal('__BUILT_APP_ORIGIN__', builtOrigin);
  }

  it('Access設定があってもJWTがなければ拒否する', async () => {
    cloudflareMode('https://records.example.com', 'https://records.example.com');
    const { response } = await request();
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('有効なAccessトークンなら利用者を設定し、成功応答にセキュリティヘッダーを付ける', async () => {
    cloudflareMode('https://records.example.com', 'https://records.example.com');
    access.verifyAccessToken.mockResolvedValue({ subject: 'access-subject', email: 'person@example.com' });
    users.findOrCreateUser.mockReturnValue({ id: 'access-user', displayName: '利用者', email: 'person@example.com', color: 1 });
    const { event, response } = await request({ 'Cf-Access-Jwt-Assertion': 'verified-token' });
    expect(access.verifyAccessToken).toHaveBeenCalledWith('verified-token', { issuer: 'https://example.cloudflareaccess.com', audience: 'test-audience' });
    expect(users.findOrCreateUser).toHaveBeenCalledWith({}, { subject: 'access-subject', email: 'person@example.com' });
    expect(event.locals).toEqual({ user: expect.objectContaining({ id: 'access-user' }) });
    expect(resolve).toHaveBeenCalledOnce();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it.each([
    ['競合', new ConflictError('email_in_use', '確認が必要です'), 403],
    ['不正な認証情報', new ValidationError('subject', '不正です'), 401]
  ])('Access利用者の登録時のエラーを適切なHTTP応答に変換する', async (_name, cause, status) => {
    cloudflareMode('https://records.example.com', 'https://records.example.com');
    access.verifyAccessToken.mockResolvedValue({ subject: 'access-subject', email: 'person@example.com' });
    users.findOrCreateUser.mockImplementation(() => { throw cause; });
    const { response } = await request({ 'Cf-Access-Jwt-Assertion': 'verified-token' });
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['公開URLが未設定', '', 'https://records.example.com'],
    ['ビルド時の公開URLと異なる', 'https://other.example.com', 'https://records.example.com'],
    ['ビルド時に公開URLが未設定', 'https://records.example.com', ''],
    ['ビルド時の値が埋め込まれていない', 'https://records.example.com', undefined]
  ])('公開URLの設定が一貫していなければAccess設定があっても利用できない: %s', async (_name, runtimeOrigin, builtOrigin) => {
    cloudflareMode(runtimeOrigin, builtOrigin);
    const { response } = await request();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(resolve).not.toHaveBeenCalled();
  });
});
