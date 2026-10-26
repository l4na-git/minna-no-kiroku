import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessConfig {
  issuer: string;
  audience: string;
}

export interface AccessIdentity {
  subject: string;
  email: string;
}

/** 公開先が明示されていない本番環境ではフォームが動かないため拒否する。 */
export function validAppOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

/** Accessの設定値は運用者が指定し、リクエストやJWTから取得しない。 */
export function accessConfig(issuer: string | undefined, audience: string | undefined): AccessConfig | null {
  if (!issuer || !audience || audience.trim() !== audience) return null;
  try {
    const url = new URL(issuer);
    if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(url.hostname) ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || url.origin !== issuer) return null;
    return { issuer, audience };
  } catch {
    return null;
  }
}

let cachedIssuer = '';
let cachedKeys: JWTVerifyGetKey | undefined;

function remoteKeys(issuer: string): JWTVerifyGetKey {
  if (!cachedKeys || cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedKeys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
  }
  return cachedKeys;
}

/** 公開鍵・issuer・audience・有効期限を検証し、人間の利用者だけを返す。 */
export async function verifyAccessToken(token: string, config: AccessConfig, keys: JWTVerifyGetKey = remoteKeys(config.issuer)): Promise<AccessIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'], issuer: config.issuer, audience: config.audience,
      requiredClaims: ['iss', 'aud', 'exp', 'sub', 'email', 'type']
    });
    if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub.trim() ||
        typeof payload.email !== 'string' || !payload.email.trim() || payload.email.trim() !== payload.email ||
        !/^[^\s@]+@[^\s@]+$/.test(payload.email)) return null;
    return { subject: payload.sub, email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}
