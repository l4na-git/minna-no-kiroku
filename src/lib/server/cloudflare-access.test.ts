import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { accessConfig, validAppOrigin, verifyAccessToken } from './cloudflare-access';
import { findOrCreateUser, openDatabase } from './db';

// 実際のJWKS取得だけを差し替える。他の jose の機能は本物を使う。
vi.mock('jose', async (importOriginal) => ({ ...(await importOriginal<typeof import('jose')>()), createRemoteJWKSet: vi.fn() }));

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

describe('Cloudflare Accessのaud(配列)', () => {
  const config = { issuer, audience };
  const signWith = async (aud: string | string[]) => {
    const pair = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'aud-key', alg: 'RS256' }] });
    const token = await new SignJWT({ email: 'person@example.com', type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'aud-key' }).setIssuer(issuer).setAudience(aud)
      .setSubject('aud-subject').setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
    return { token, jwks };
  };

  it('audが配列で、設定したaudienceを含んでいれば受け付ける', async () => {
    const { token, jwks } = await signWith(['other-audience', audience]);
    expect(await verifyAccessToken(token, config, jwks)).toEqual({ subject: 'aud-subject', email: 'person@example.com' });
  });

  it('audが配列でも、設定したaudienceを含まなければ拒否する', async () => {
    const { token, jwks } = await signWith(['other-audience', 'another-audience']);
    expect(await verifyAccessToken(token, config, jwks)).toBeNull();
    const { token: prefixed, jwks: prefixedKeys } = await signWith([`${audience}-extra`, `x${audience}`]);
    expect(await verifyAccessToken(prefixed, config, prefixedKeys)).toBeNull();
  });

  it('audが空の配列なら拒否する', async () => {
    const { token, jwks } = await signWith([]);
    expect(await verifyAccessToken(token, config, jwks)).toBeNull();
  });
});

describe('Cloudflare AccessのJWKS取得先', () => {
  const issuerA = 'https://team-a.cloudflareaccess.com';
  const issuerB = 'https://team-b.cloudflareaccess.com';

  it('同じissuerなら公開鍵の取得先を使い回し、issuerが変わると新しい取得先に切り替える', async () => {
    const pairs = { [issuerA]: await generateKeyPair('RS256'), [issuerB]: await generateKeyPair('RS256') };
    const jwksByHost = new Map<string, JWTVerifyGetKey>();
    for (const [iss, pair] of Object.entries(pairs)) {
      jwksByHost.set(new URL(iss).host, createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'RS256' }] }));
    }
    vi.mocked(createRemoteJWKSet).mockImplementation(((url: URL) => jwksByHost.get(url.host)!) as unknown as typeof createRemoteJWKSet);
    const tokenFor = (iss: string) => new SignJWT({ email: 'person@example.com', type: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k' }).setIssuer(iss).setAudience(audience)
      .setSubject('s').setIssuedAt().setExpirationTime('5m').sign(pairs[iss as keyof typeof pairs].privateKey);
    const verify = async (iss: string, tokenIssuer = iss) => verifyAccessToken(await tokenFor(tokenIssuer), { issuer: iss, audience });
    const fetched = () => vi.mocked(createRemoteJWKSet).mock.calls.map(([url]) => String(url));

    expect(await verify(issuerA)).not.toBeNull();
    expect(await verify(issuerA)).not.toBeNull();
    expect(fetched()).toEqual([`${issuerA}/cdn-cgi/access/certs`]);

    // issuerを切り替えたら、前のissuerの公開鍵は使わず、新しい取得先の鍵で検証する
    expect(await verify(issuerB)).not.toBeNull();
    expect(fetched()).toEqual([`${issuerA}/cdn-cgi/access/certs`, `${issuerB}/cdn-cgi/access/certs`]);

    // 別のissuerが署名したトークンは、設定したissuerの鍵では検証できない(鍵の混用がない)
    const mixed = await verifyAccessToken(await tokenFor(issuerA), { issuer: issuerB, audience });
    expect(mixed).toBeNull();
  });
});
