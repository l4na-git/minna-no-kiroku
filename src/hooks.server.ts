import type { Handle } from '@sveltejs/kit/hooks';
import { developmentUser } from './lib/server/auth';
import { accessConfig, validAppOrigin, verifyAccessToken } from './lib/server/cloudflare-access';
import { getDb } from './lib/server/db/client';
import { findOrCreateUser } from './lib/server/db/users';
import { ConflictError, ValidationError } from './lib/server/db/errors';

export const handle: Handle = async ({ event, resolve }) => {
  const mode = process.env.AUTH_MODE;
  let identity = developmentUser(mode);
  if (!identity && mode === 'cloudflare') {
    const config = accessConfig(process.env.CF_ACCESS_TEAM_DOMAIN, process.env.CF_ACCESS_AUD);
    if (!config || !validAppOrigin(process.env.ORIGIN)) return new Response('認証の準備ができていません。', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const token = event.request.headers.get('Cf-Access-Jwt-Assertion');
    identity = token ? await verifyAccessToken(token, config) : null;
    if (!identity) return new Response('認証を確認できませんでした。', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!identity) {
    return new Response('認証の準備ができていません。', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  try {
    event.locals.user = findOrCreateUser(getDb(), identity);
  } catch (error) {
    if (error instanceof ConflictError) {
      return new Response('アカウントの確認が必要です。運用者に連絡してください。', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error instanceof ValidationError) {
      return new Response('認証を確認できませんでした。', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    throw error;
  }
  const response = await resolve(event);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};
