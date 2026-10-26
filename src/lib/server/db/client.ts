import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { runMigrations } from './migrate';
import { seedCategories } from './categories';

export const DEFAULT_PATH = './data/app.db';
export const DEFAULT_TIME_ZONE = 'Asia/Tokyo';

export type AppDb = {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  /** 現在時刻(UTC ミリ秒)。テストで差し替える。 */
  now: () => number;
  /** 表示タイムゾーンでの今日(YYYY-MM-DD)。未来日の判定に使う。 */
  today: () => string;
  close: () => void;
};

export type OpenOptions = {
  /** DB ファイル。':memory:' も可。既定は環境変数 DATABASE_PATH、なければ ./data/app.db */
  path?: string;
  /** 既定は環境変数 TZ、なければ Asia/Tokyo */
  timeZone?: string;
  now?: () => number;
};

function dateInZone(ms: number, timeZone: string): string {
  // en-CA は YYYY-MM-DD で出る
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(ms));
}

/** 接続を開き、PRAGMA 設定・マイグレーション・初期カテゴリを済ませて返す。 */
export function openDatabase(options: OpenOptions = {}): AppDb {
  const path = options.path ?? process.env.DATABASE_PATH ?? DEFAULT_PATH;
  const timeZone = options.timeZone ?? process.env.TZ ?? DEFAULT_TIME_ZONE;
  const now = options.now ?? Date.now;
  dateInZone(0, timeZone); // 不正なタイムゾーンはここで失敗させる

  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  try {
    // 外部キーは接続ごとの設定。トランザクションの外で設定する。
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    if (sqlite.pragma('foreign_keys', { simple: true }) !== 1)
      throw new Error('foreign_keys を有効にできませんでした');

    runMigrations(sqlite, now);
    const db = drizzle(sqlite, { schema });
    const handle: AppDb = {
      sqlite,
      db,
      now,
      today: () => dateInZone(now(), timeZone),
      close: () => sqlite.close()
    };
    seedCategories(handle);
    return handle;
  } catch (e) {
    sqlite.close();
    throw e;
  }
}

let shared: AppDb | undefined;

/** アプリ全体で共有する接続(初回に開く)。 */
export function getDb(): AppDb {
  return (shared ??= openDatabase());
}

/** 書き込みは BEGIN IMMEDIATE の 1 トランザクションで行う。 */
export function write<T>(d: AppDb, fn: (db: AppDb['db']) => T): T {
  return d.sqlite.transaction(() => fn(d.db)).immediate();
}
