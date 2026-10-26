# 運用ガイド

この文書は Docker Compose で運用する管理者向けの手順である。記録とバックアップは機微な情報として扱い、アクセスを制限した保存先に置く。

## 初回起動

`.env.example` を `.env` にコピーし、Cloudflare Access と Tunnel の値を設定する。`APP_ORIGIN` は実際の HTTPS 公開 URL と完全に一致させる。

```sh
docker compose --profile tunnel up --build -d
docker compose ps
```

`cloudflared` は `tunnel` プロファイルでのみ起動する。`docker compose up` だけでは外部公開用の Tunnel は起動しない。

## 再起動と状態確認

アプリと Tunnel は `restart: unless-stopped` に設定されている。初回起動後は、Docker デーモンとホストが再起動すると自動で起動する。ただし、ホストの起動時に Docker が起動するよう設定しておく。

手動で起動・再作成する場合は次を実行する。

```sh
docker compose --profile tunnel up -d
docker compose ps
docker compose logs --tail=100 app cloudflared
```

正常に起動したら、Cloudflare Access で許可された利用者がログインできることと、未許可の利用者が拒否されることを確認する。

## 更新

更新前に必ずバックアップを取得する。Git で取得した運用環境では、作業ツリーにローカル変更がないことを確認してから、必要な版を取得する。

```sh
git pull --ff-only
docker compose --profile tunnel up --build -d
docker compose ps
```

`APP_ORIGIN` を変更した場合は、必ず `--build` を付けて再ビルドする。ビルド時と実行時の値が異なる、または未設定の場合、アプリはすべてのアクセスを拒否する。

更新後は、許可された利用者のログイン、未許可の利用者の拒否、記録の読み書きを確認する。

## バックアップ

SQLite の DB ファイルを稼働中に単純コピーしない。SQLite のバックアップ API で、まず同じボリューム内にバックアップを作成する。

```sh
docker compose exec app node -e 'const D=require("better-sqlite3"); const d=new D("/app/data/app.db",{readonly:true,fileMustExist:true}); const p="/app/data/backup-"+Date.now()+".db"; d.backup(p).then(()=>{console.log(p);d.close()}).catch(e=>{console.error(e);process.exitCode=1})'
# 表示されたファイル名を指定し、アクセスを制限した保存先へコピーする
docker compose cp app:/app/data/backup-ファイル名.db ./backup.db
```

コピーした `backup.db` は機微な情報である。運用ホスト上に置いたままにせず、アクセスを制限した別の保存先へ移し、取得日時を記録する。

## 復元確認

稼働中の DB を上書きせず、バックアップから別名の DB を作って整合性を検査する。次の `バックアップファイル名.db` は実際の名前に置き換える。

```sh
docker compose exec app node -e 'const D=require("better-sqlite3"); const src=new D(process.argv[1],{readonly:true,fileMustExist:true}); const p="/app/data/restore-check-"+Date.now()+".db"; src.backup(p).then(()=>{src.close(); const restored=new D(p,{readonly:true,fileMustExist:true}); console.log("復元先:",p,"整合性:",restored.pragma("integrity_check",{simple:true})); restored.close()}).catch(e=>{console.error(e);process.exitCode=1})' /app/data/バックアップファイル名.db
```

整合性が `ok` であることに加え、アクセスを制限した別環境で記録を読めることを確認する。

## データを失わないための注意

SQLite の DB は Docker ボリューム `app-data` に保存される。コンテナを作り直しても残るが、次の操作はボリュームと記録を削除するため実行しない。

```sh
docker compose down -v
docker volume rm minna-no-kiroku_app-data
```

実際の復元で既存データを上書きする必要がある場合は、アプリを停止し、現在のボリュームと DB を保全したうえで作業する。バックアップの復元確認が済むまで、既存データを削除しない。
