# みんなのきろく (minna no kiroku)

認知症かもしれない人の親族が、日々の「なんか気になる」という気づきを記録・共有し、専門家への相談を考えるきっかけをつくる Web アプリです。

## 何をするアプリか

- 親族が気になった出来事を、自然な文章で気軽に書く
- 1 つの設置先を家族の共有スペースとし、アクセスを許可された人全員で記録を共有する
- 編集・削除は記録した本人だけが行う。招待や複数グループの管理は現行版に含めない
- 記録を日付ごとに見返す。病院などで相談するときに、「いつ・何があったか」を説明するために、期間を絞って印刷や PDF にもできる

検討中の機能は [今後の検討](docs/roadmap.md) を参照してください。

```
気になった → 雑に書く → 親族に共有する → 記録が蓄積する → 振り返る → 専門家への相談を考える
```

## 大切にしていること

- 本人を評価したり、監視したりしません。親族が感じた気づきを残して、本人との対話や、専門家への相談につなげるための記録です。
- AI は診断しません。AI を入れるときも、役割は文章の整形だけです。認知症の可能性、医学的な意味付け、診断、判定は行いません。
- データは自分の手元に置けます。自宅サーバーなどで動かせることを前提に、設計しています。

## 技術

- Web アプリ（TypeScript / SvelteKit / SQLite）
- 認証: Cloudflare Access（SSO）
- 配備: Docker

## 開発環境

Node.js 24 と npm を使います。依存関係をインストールし、開発用認証を指定して起動します。

```sh
npm ci
AUTH_MODE=development npm run dev
```

表示されたローカルURLにアクセスしてください。開発サーバーは `127.0.0.1` にのみ待ち受けます。`AUTH_MODE` を省略した場合は利用できません。開発時のSQLiteは `./data/app.db` に保存され、`DATABASE_PATH` で変更できます。

```sh
npm run check  # 型とSvelteの検査
npm test       # 単体テスト
npx playwright install chromium --only-shell  # 初回のみ
npm run test:e2e  # 一時DBを使う画面操作テスト
npm run build  # 本番ビルド
npm run test:production  # 本番ビルドで認証の拒否と公開URLの一貫性を確認（ビルドを複数回行う）
```

開発用認証は固定ユーザーを再現するだけで、本物の認証ではありません。開発サーバーの接続先を外部に変更したり、トンネル経由で公開したりしないでください。本番ビルドでは `AUTH_MODE=development` でもアクセスを拒否します。

## クイックスタート

Docker と Cloudflare Zero Trust を利用できる環境で、家族の共有スペースを起動する手順です。

1. Cloudflare Zero TrustでAccessアプリを作成し、許可する人を設定します。アプリケーションのAUDとチームドメインを確認します。
2. リモート管理のTunnelを作り、公開ホスト名の接続先を `http://app:3000` に設定します。ホスト名をAccessアプリで保護します。
3. `.env.example` を `.env` にコピーし、`CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD`、`APP_ORIGIN`（実際の `https://` 公開URL）、`TUNNEL_TOKEN` を設定します。`.env` は秘密情報を含みます。他人に共有したりリポジトリに入れたりしないでください。
4. `docker compose --profile tunnel up --build -d` で起動します。`APP_ORIGIN` はSvelteKitのビルド時設定にも使われます。ビルド時の値と実行時の値が異なる場合、またはビルド時に未設定の場合は、フォームが動かなくなるため、すべてのアクセスを拒否します（ログに理由が出ます）。変更した場合は `--build` を付けて再ビルドしてください。アプリのポートはホストに公開しません。`docker compose up --build` だけの場合はTunnelは起動しません。

設定が不完全な場合はアクセスを拒否します。実際の利用を始める前に、許可された人のログインと、未許可の人のアクセス拒否をそれぞれ確認してください。`TZ` の既定は `Asia/Tokyo` です。

## 運用とバックアップ

再起動、更新、状態確認、バックアップと復元確認の手順は [運用ガイド](docs/operations.md) を参照してください。記録は Docker ボリュームに保存されます。`docker compose down -v` のようにボリュームを削除する操作は、記録を失うため実行しないでください。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/product.md](docs/product.md) | 作りたいもの（目的、対象ユーザー、基本の方針） |
| [docs/spec.md](docs/spec.md) | 現行仕様 |
| [docs/roadmap.md](docs/roadmap.md) | 今後の検討 |
| [docs/operations.md](docs/operations.md) | 再起動、更新、バックアップ、復元確認 |
| [docs/tech.md](docs/tech.md) | 技術方針 |
| [docs/adr/0001-web-framework.md](docs/adr/0001-web-framework.md) | Web フレームワークの選定 |
| [docs/design.md](docs/design.md) | 画面設計 |
| [docs/data-model.md](docs/data-model.md) | データモデル |

## ライセンス

このプロジェクトは MIT License のもとで公開しています。
詳しくは [LICENSE](LICENSE) をご確認ください。
