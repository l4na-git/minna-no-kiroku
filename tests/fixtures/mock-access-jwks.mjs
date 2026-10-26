// テスト専用: 本番ビルドのサーバーに --import で読み込ませ、Cloudflare Access の JWKS 取得だけをローカルの公開鍵で応答する。
// アプリ本体の設定や検証コードには手を入れない。それ以外の fetch は本物を呼ぶ。
const certsUrl = 'https://example.cloudflareaccess.com/cdn-cgi/access/certs';
const keys = JSON.parse(process.env.MOCK_ACCESS_JWKS ?? '{"keys":[]}');
const realFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === certsUrl) return Promise.resolve(Response.json(keys));
  return realFetch(input, init);
};
