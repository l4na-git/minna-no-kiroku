import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { accessConfig, validAppOrigin, verifyAccessToken } from './cloudflare-access';
import { findOrCreateUser, openDatabase } from './db';

const issuer = 'https://example.cloudflareaccess.com';
const audience = 'app-audience';
let sign: (claims?: Record<string, unknown>, expiration?: string) => Promise<string>;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const publicKey = await exportJWK(pair.publicKey);
  keys = createLocalJWKSet({ keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256' }] });
  sign = (claims = {}, expiration = '5m') => new SignJWT({ email: 'Person@Example.com', type: 'app', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(issuer).setAudience(audience)
    .setSubject(typeof claims.sub === 'string' ? claims.sub : 'test-subject').setIssuedAt().setExpirationTime(expiration).sign(pair.privateKey);
});

describe('Cloudflare Accessの認証', () => {
  const config = { issuer, audience };
  it('本番の公開URLはhttpsのoriginのみ受け付ける', () => {
    expect(validAppOrigin('https://records.example.com')).toBe(true);
    for (const value of [undefined, '', 'http://localhost:3000', 'https://records.example.com/', 'https://records.example.com/path']) expect(validAppOrigin(value)).toBe(false);
  });
  it('信頼できる発行元とaudienceだけを設定として受け付ける', () => {
    expect(accessConfig(issuer, audience)).toEqual(config);
    for (const value of ['', 'http://example.cloudflareaccess.com', 'https://example.cloudflareaccess.com.evil.com', `${issuer}/path`, `${issuer}/`, 'https://user@example.cloudflareaccess.com']) {
      expect(accessConfig(value, audience)).toBeNull();
    }
    expect(accessConfig(issuer, '')).toBeNull();
  });
  it('有効なアプリトークンから認証済みの利用者を取得する', async () => {
    expect(await verifyAccessToken(await sign(), config, keys)).toEqual({ subject: 'test-subject', email: 'person@example.com' });
  });
  it('署名を検証した利用者をDBに登録し、次回も同じIDを使う', async () => {
    const identity = await verifyAccessToken(await sign(), config, keys);
    expect(identity).not.toBeNull();
    const db = openDatabase({ path: ':memory:' });
    try {
      const first = findOrCreateUser(db, identity!);
      const again = findOrCreateUser(db, (await verifyAccessToken(await sign(), config, keys))!);
      expect(again.id).toBe(first.id);
      expect(again.email).toBe('person@example.com');
    } finally { db.close(); }
  });
  it('期限切れ、不正なaudienceとissuer、偽署名を拒否する', async () => {
    const token = await sign();
    expect(await verifyAccessToken(await sign({}, '-1s'), config, keys)).toBeNull();
    expect(await verifyAccessToken(token, { ...config, audience: 'wrong' }, keys)).toBeNull();
    expect(await verifyAccessToken(token, { ...config, issuer: 'https://wrong.cloudflareaccess.com' }, keys)).toBeNull();
    const other = await generateKeyPair('RS256');
    const otherKey = await exportJWK(other.publicKey);
    expect(await verifyAccessToken(token, config, createLocalJWKSet({ keys: [{ ...otherKey, kid: 'test-key' }] }))).toBeNull();
  });
  it('人間のユーザーでないトークンや不十分な情報を拒否する', async () => {
    for (const claims of [{ sub: '' }, { email: '' }, { email: 'not-email' }, { type: 'org' }]) {
      expect(await verifyAccessToken(await sign(claims), config, keys)).toBeNull();
    }
    expect(await verifyAccessToken('not-a-jwt', config, keys)).toBeNull();
  });
  it('有効期限がないトークンと未開始のトークンを拒否する', async () => {
    const pair = await generateKeyPair('RS256');
    const publicKey = await exportJWK(pair.publicKey);
    const testKeys = createLocalJWKSet({ keys: [{ ...publicKey, kid: 'k' }] });
    const base = () => new SignJWT({ email: 'person@example.com', type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k' }).setIssuer(issuer).setAudience(audience).setSubject('subject');
    expect(await verifyAccessToken(await base().sign(pair.privateKey), config, testKeys)).toBeNull();
    expect(await verifyAccessToken(await base().setNotBefore('5m').setExpirationTime('10m').sign(pair.privateKey), config, testKeys)).toBeNull();
  });
});
