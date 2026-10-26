import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('本番ビルドは開発用認証を指定してもリクエストを拒否する', { timeout: 20000 }, async (t) => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

  const server = spawn(process.execPath, ['build'], {
    env: { ...process.env, NODE_ENV: 'production', AUTH_MODE: 'development', HOST: '127.0.0.1', PORT: String(port) },
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

  for (const options of [{}, { headers: { 'Cf-Access-Jwt-Assertion': 'unverified' } }]) {
    const response = await fetch(`http://127.0.0.1:${port}/`, options);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /認証の準備ができていません/);
  }
  const post = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' });
  assert.ok([403, 503].includes(post.status), `POSTが拒否されませんでした: ${post.status}`);
});

test('本番のAccess設定でも未認証・偽のトークンはすべての画面で拒否する', { timeout: 20000 }, async (t) => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  const server = spawn(process.execPath, ['build'], {
    env: { ...process.env, NODE_ENV: 'production', AUTH_MODE: 'cloudflare', CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com', CF_ACCESS_AUD: 'test-audience', ORIGIN: 'https://records.example.com', HOST: '127.0.0.1', PORT: String(port) },
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
  for (const path of ['/', '/summary', '/settings', '/entries/new', '/entries/00000000-0000-4000-8000-000000000000']) {
    for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJIUzI1NiJ9.e30.invalid' }]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
      assert.equal(response.status, 401, `${path}: ${response.status}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});
