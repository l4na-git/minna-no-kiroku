import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';

const origin = 'https://records.example.com';
const otherOrigin = 'https://other.example.com';
const buildRoot = '.svelte-kit/production-test';
const access = { AUTH_MODE: 'cloudflare', CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com', CF_ACCESS_AUD: 'test-audience' };
const { APP_ORIGIN: _ignored, ...baseEnv } = process.env;

function build(name, appOrigin) {
  const env = { ...baseEnv, ...(appOrigin === undefined ? {} : { APP_ORIGIN: appOrigin }) };
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { env, encoding: 'utf8', timeout: 120000 });
  if (name) {
    assert.equal(result.status, 0, result.stderr + result.stdout);
    cpSync('build', `${buildRoot}/${name}`, { recursive: true });
  }
  return result;
}

before(() => {
  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(buildRoot, { recursive: true });
  build('with-origin', origin);
  build('without-origin', undefined);
}, { timeout: 240000 });

after(() => rmSync(buildRoot, { recursive: true, force: true }));

async function start(t, name, env, { preload } = {}) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  const server = spawn(process.execPath, [...(preload ? ['--import', preload] : []), `${buildRoot}/${name}`], {
    env: { ...baseEnv, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { if (server.exitCode === null) server.kill(); });
  let stderr = '';
  server.stderr.on('data', (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('Listening on')) resolve(); });
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`サーバーが終了しました (${code}): ${stderr}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    get: (path = '/', headers = {}) => fetch(`${base}${path}`, { headers }),
    post: (postOrigin) => fetch(`${base}/`, {
      method: 'POST',
      headers: { Origin: postOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=b'
    })
  };
}

test('本番ビルドは開発用認証を指定してもリクエストを拒否する', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'without-origin', { AUTH_MODE: 'development' });
  for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'unverified' }]) {
    const response = await app.get('/', headers);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /認証の準備ができていません/);
  }
  const post = await fetch(`${app.base}/`, { method: 'POST' });
  assert.ok([403, 503].includes(post.status), `POSTが拒否されませんでした: ${post.status}`);
});

test('本番のAccess設定でも未認証・偽のトークンはすべての画面で拒否する', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'with-origin', { ...access, APP_ORIGIN: origin });
  for (const path of ['/', '/summary', '/settings', '/entries/new', '/entries/00000000-0000-4000-8000-000000000000']) {
    for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJIUzI1NiJ9.e30.invalid' }]) {
      const response = await app.get(path, headers);
      assert.equal(response.status, 401, `${path}: ${response.status}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('ビルド時の公開URLと同じOriginのPOSTはCSRF検査を通り、他のOriginは拒否する', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'with-origin', { ...access, APP_ORIGIN: origin });
  // 認証まで進むので、JWTなしの401になる（CSRFで止まれば403）
  assert.equal((await app.post(origin)).status, 401);
  assert.equal((await app.post(otherOrigin)).status, 403);
  // 公開URLに固定しているため、リクエスト自体のOriginでも通さない
  assert.equal((await app.post(app.base)).status, 403);
  // 通常フォームで Origin が null または欠落した場合も、認証前に拒否する
  assert.equal((await app.post('null')).status, 403);
  const missingOrigin = await fetch(`${app.base}/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(missingOrigin.status, 403);
});

test('実行時の公開URLがビルド時の値と異なる場合は、何も受け付けない', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'with-origin', { ...access, APP_ORIGIN: otherOrigin });
  const response = await app.get('/');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await app.post(origin)).status, 503);
  assert.equal((await app.post(otherOrigin)).status, 403);
});

test('実行時の公開URLが未設定の場合は、何も受け付けない', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'with-origin', { ...access });
  assert.equal((await app.get('/')).status, 503);
  assert.equal((await app.post(origin)).status, 503);
});

test('ビルド時に公開URLが未設定のビルドは、実行時に指定しても何も受け付けない', { timeout: 20000 }, async (t) => {
  const app = await start(t, 'without-origin', { ...access, APP_ORIGIN: origin });
  const response = await app.get('/');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok([403, 503].includes((await app.post(origin)).status));
});

test('不正な公開URLでは本番ビルドが失敗する', { timeout: 60000 }, () => {
  for (const value of ['http://records.example.com', `${origin}/`, `${origin}/path`]) {
    const result = build(undefined, value);
    assert.notEqual(result.status, 0, value);
    assert.match(result.stderr + result.stdout, /APP_ORIGIN/);
  }
});

// --- 認証済みの統合テスト: ローカルの鍵で署名した JWT と、その公開鍵だけを返す JWKS を使う ---
const accessKeys = await generateKeyPair('RS256');
const accessJwks = JSON.stringify({ keys: [{ ...(await exportJWK(accessKeys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }] });

function accessToken(subject, email) {
  return new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(access.CF_ACCESS_TEAM_DOMAIN).setAudience(access.CF_ACCESS_AUD)
    .setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(accessKeys.privateKey);
}

test('有効なAccess JWTで、記録の作成(通常フォームPOST)と本人による削除が303で成功し、削除後は読めない', { timeout: 30000 }, async (t) => {
  const dataDir = mkdtempSync(`${tmpdir()}/minna-no-kiroku-prod-`);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const app = await start(t, 'with-origin', {
    ...access, APP_ORIGIN: origin, TZ: 'Asia/Tokyo', DATABASE_PATH: `${dataDir}/app.db`, MOCK_ACCESS_JWKS: accessJwks
  }, { preload: new URL('./fixtures/mock-access-jwks.mjs', import.meta.url).pathname });

  const jwt = await accessToken('prod-subject', 'Writer@Example.com');
  const send = (path, init = {}) => fetch(`${app.base}${path}`, {
    redirect: 'manual', ...init, headers: { 'Cf-Access-Jwt-Assertion': jwt, ...init.headers }
  });
  const form = (path, fields) => send(path, {
    method: 'POST',
    // ブラウザの通常フォームと同じく Accept: text/html を送る（*/* だと SvelteKit は JSON 応答にする）
    headers: { Origin: origin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields)
  });

  // JWTが署名・iss・aud・期限を満たせば画面まで届き、フォームから初期カテゴリのIDを読める
  const page = await send('/entries/new');
  assert.equal(page.status, 200);
  const categoryId = (await page.text()).match(/<input[^>]*name="categoryId"[^>]*value="([^"]+)"/)?.[1];
  assert.ok(categoryId, '記録フォームにカテゴリが見つかりません');

  const body = '統合テストの記録';
  const eventDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const created = await form('/entries/new?/save', { body, eventDate, eventPeriod: 'morning', categoryId });
  assert.equal(created.status, 303);
  assert.equal(created.headers.get('location'), '/');

  const list = await (await send('/')).text();
  assert.ok(list.includes(body), '作成した記録が一覧にありません');
  const entryId = list.match(/href="\/entries\/([0-9a-f-]{36})"/)?.[1];
  assert.ok(entryId, '記録のIDが一覧にありません');
  const detail = await send(`/entries/${entryId}`);
  assert.equal(detail.status, 200);
  assert.ok((await detail.text()).includes(body));

  // CSRF検査は緩めていない: 別Originからの削除は、有効なJWTがあっても通らず、記録は残る
  const forged = await send(`/entries/${entryId}?/delete`, {
    method: 'POST', headers: { Origin: otherOrigin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' }, body: ''
  });
  assert.equal(forged.status, 403);
  assert.equal((await send(`/entries/${entryId}`)).status, 200);

  const deleted = await form(`/entries/${entryId}?/delete`, {});
  assert.equal(deleted.status, 303);
  assert.equal(deleted.headers.get('location'), '/');
  assert.equal((await send(`/entries/${entryId}`)).status, 404);
  assert.ok(!(await (await send('/')).text()).includes(body), '削除した記録が一覧に残っています');
});

// --- 認証済みの本番ビルドに対する、他人の記録の保護と、フォーム以外の POST の扱い ---
const mockJwks = new URL('./fixtures/mock-access-jwks.mjs', import.meta.url).pathname;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

async function startWithAccess(t) {
  const dataDir = mkdtempSync(`${tmpdir()}/minna-no-kiroku-prod-`);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const app = await start(t, 'with-origin', {
    ...access, APP_ORIGIN: origin, TZ: 'Asia/Tokyo', DATABASE_PATH: `${dataDir}/app.db`, MOCK_ACCESS_JWKS: accessJwks
  }, { preload: mockJwks });
  /** 指定した利用者のJWTで送る。通常のフォーム POST は origin を渡さなければ公開URLのOriginになる。 */
  const as = async (subject, email) => {
    const jwt = await accessToken(subject, email);
    const send = (path, init = {}) => fetch(`${app.base}${path}`, {
      redirect: 'manual', ...init, headers: { 'Cf-Access-Jwt-Assertion': jwt, ...init.headers }
    });
    const form = (path, fields, postOrigin = origin) => send(path, {
      method: 'POST',
      headers: { Origin: postOrigin, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields)
    });
    return { send, form };
  };
  return { ...app, as };
}

/** 記録を作り、その ID を返す。 */
async function createEntry(user, body) {
  const categoryId = (await (await user.send('/entries/new')).text()).match(/<input[^>]*name="categoryId"[^>]*value="([^"]+)"/)?.[1];
  assert.ok(categoryId, '記録フォームにカテゴリが見つかりません');
  const created = await user.form('/entries/new?/save', { body, eventDate: today(), categoryId });
  assert.equal(created.status, 303);
  const list = await (await user.send('/')).text();
  const entryId = list.match(new RegExp(`href="/entries/([0-9a-f-]{36})"[^]*?${body}`))?.[1];
  assert.ok(entryId, '作成した記録のIDが一覧にありません');
  return entryId;
}

test('ユーザーAの記録をユーザーBは読めるが、編集・削除は403で拒否され、記録はそのまま残る', { timeout: 30000 }, async (t) => {
  const app = await startWithAccess(t);
  const a = await app.as('subject-a', 'a@example.com');
  const b = await app.as('subject-b', 'b@example.com');
  const body = 'ユーザーAだけが変更できる記録';
  const entryId = await createEntry(a, body);

  // 家族の共有スペースなので、BはAの記録を読める
  const detail = await b.send(`/entries/${entryId}`);
  assert.equal(detail.status, 200);
  assert.ok((await detail.text()).includes(body));

  // 編集画面もBには開かない。Aには開き、そこから現在の版(version)を得る
  assert.equal((await b.send(`/entries/${entryId}/edit`)).status, 403);
  const edit = await a.send(`/entries/${entryId}/edit`);
  assert.equal(edit.status, 200);
  const version = (await edit.text()).match(/<input[^>]*name="version"[^>]*value="(\d+)"/)?.[1];
  assert.ok(version, '編集フォームに版(version)がありません');

  // Bが正しい版を付けて編集・削除を直接POSTしても、公開Originの通常フォームとして検査を通ったうえで403になる
  // 入力は有効なので、拒否の理由は検証エラーではなく「他人の記録」であることに限られる
  const categoryId = (await (await b.send('/entries/new')).text()).match(/<input[^>]*name="categoryId"[^>]*value="([^"]+)"/)?.[1];
  const edited = await b.form(`/entries/${entryId}/edit?/save`, { body: 'Bによる書き換え', eventDate: today(), categoryId, version });
  assert.equal(edited.status, 403);
  const deleted = await b.form(`/entries/${entryId}?/delete`, {});
  assert.equal(deleted.status, 403);

  // 記録は本文も存在もAのまま残り、Aは引き続き読める
  for (const user of [a, b]) {
    const after = await user.send(`/entries/${entryId}`);
    assert.equal(after.status, 200);
    const html = await after.text();
    assert.ok(html.includes(body));
    assert.ok(!html.includes('Bによる書き換え'));
  }
});

test('有効なJWTがあっても、Origin が null・別・欠落の multipart と text/plain のフォームPOSTは403で、記録は作られない', { timeout: 30000 }, async (t) => {
  const app = await startWithAccess(t);
  const user = await app.as('subject-csrf', 'csrf@example.com');
  const categoryId = (await (await user.send('/entries/new')).text()).match(/<input[^>]*name="categoryId"[^>]*value="([^"]+)"/)?.[1];
  const fields = { body: 'CSRFで作られてはいけない記録', eventDate: today(), categoryId };
  const multipart = () => { const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.set(k, v); return { body: data }; };
  const plain = () => ({ headers: { 'Content-Type': 'text/plain' }, body: Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') });
  for (const [kind, payload] of [['multipart/form-data', multipart], ['text/plain', plain]]) {
    for (const postOrigin of ['null', otherOrigin, undefined]) {
      const { headers, body } = payload();
      const response = await user.send('/entries/new?/save', {
        method: 'POST', body, headers: { Accept: 'text/html', ...headers, ...(postOrigin === undefined ? {} : { Origin: postOrigin }) }
      });
      assert.equal(response.status, 403, `${kind} / Origin: ${postOrigin ?? '(なし)'}`);
    }
  }
  assert.ok(!(await (await user.send('/')).text()).includes(fields.body), '拒否されたはずの記録が作られています');
});

test('JSONのPOSTはフォームactionを実行せず(415)、正しい本文でも記録は作られない', { timeout: 30000 }, async (t) => {
  const app = await startWithAccess(t);
  // JWTなしでは認証で止まる(フォーム以外のContent-TypeはCSRF検査の対象外なので、403ではなく401)
  const anonymous = await fetch(`${app.base}/entries/new?/save`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(anonymous.status, 401);

  const user = await app.as('subject-json', 'json@example.com');
  const categoryId = (await (await user.send('/entries/new')).text()).match(/<input[^>]*name="categoryId"[^>]*value="([^"]+)"/)?.[1];
  const payload = { body: 'JSONで作られてはいけない記録', eventDate: today(), categoryId };
  for (const postOrigin of [origin, otherOrigin]) {
    const response = await user.send('/entries/new?/save', {
      method: 'POST', headers: { Origin: postOrigin, Accept: 'text/html', 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 415, `Origin: ${postOrigin}`);
  }
  assert.ok(!(await (await user.send('/')).text()).includes(payload.body), 'JSONのPOSTで記録が作られています');
});
