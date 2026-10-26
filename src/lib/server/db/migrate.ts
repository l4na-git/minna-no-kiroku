import type Database from 'better-sqlite3';

// ビルド後(adapter-node)でもファイルパスに依存しないよう、SQL は取り込んでバンドルに含める。
const files = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

export const migrations = Object.entries(files)
  .map(([path, sql]) => ({ id: path.replace(/^.*\//, '').replace(/\.sql$/, ''), sql }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

/**
 * 未適用のマイグレーションを順に適用する。何度呼んでも同じ結果になる。
 * 1 本ごとに BEGIN IMMEDIATE で適用と記録を行うので、途中で失敗しても半端に残らず、
 * 同時に起動した別プロセスとも競合しない。
 */
export function runMigrations(sqlite: Database.Database, now: () => number = Date.now): string[] {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT NOT NULL PRIMARY KEY, applied_at INTEGER NOT NULL)'
  );
  const applied: string[] = [];
  for (const m of migrations) {
    sqlite
      .transaction(() => {
        const done = sqlite.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(m.id);
        if (done) return;
        sqlite.exec(m.sql);
        sqlite
          .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
          .run(m.id, now());
        applied.push(m.id);
      })
      .immediate();
  }
  return applied;
}
