import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit/hooks';

const environment = vi.hoisted(() => ({ dev: true }));
vi.mock('$app/env', () => ({ get dev() { return environment.dev; } }));
vi.mock('./lib/server/db/client', () => ({ getDb: () => ({}) }));
vi.mock('./lib/server/db/users', () => ({ findOrCreateUser: () => ({ id: 'development-user', displayName: '開発用ユーザー', email: 'development@example.invalid', color: 0 }) }));

import { handle } from './hooks.server';

describe('リクエストの認証', () => {
  const resolve = vi.fn(async () => new Response('開発用画面'));

  beforeEach(() => {
    vi.stubEnv('AUTH_MODE', 'development');
    environment.dev = true;
    resolve.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  async function request() {
    const event = { locals: {}, request: new Request('http://localhost/') };
    const response = await handle({ event, resolve } as unknown as Parameters<Handle>[0]);
    return { event, response };
  }

  it('開発サーバーで明示的に指定した場合は開発用ユーザーを設定する', async () => {
    const { event, response } = await request();
    expect(response.status).toBe(200);
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

  it('Access設定があってもJWTがなければ拒否する', async () => {
    environment.dev = false;
    vi.stubEnv('AUTH_MODE', 'cloudflare');
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'https://example.cloudflareaccess.com');
    vi.stubEnv('CF_ACCESS_AUD', 'test-audience');
    vi.stubEnv('ORIGIN', 'https://records.example.com');
    const { response } = await request();
    expect(response.status).toBe(401);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('公開URLが未設定ならAccess設定があっても利用できない', async () => {
    environment.dev = false;
    vi.stubEnv('AUTH_MODE', 'cloudflare');
    vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'https://example.cloudflareaccess.com');
    vi.stubEnv('CF_ACCESS_AUD', 'test-audience');
    vi.stubEnv('ORIGIN', '');
    expect((await request()).response.status).toBe(503);
  });
});
