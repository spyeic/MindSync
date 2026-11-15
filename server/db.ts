import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

export function openDatabase(path: string, migrations = resolve('drizzle')) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path, { timeout: 5000 });
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.transaction(() => {
      const files = readdirSync(migrations).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
      const version = Number(sqlite.pragma('user_version', { simple: true }));
      if (!files.length || version > files.length) throw new Error('Incompatible SQLite migration version');
      for (let index = version; index < files.length; index++) {
        if (Number(files[index].slice(0, 4)) !== index) throw new Error('SQLite migrations must be sequential');
        sqlite.exec(readFileSync(join(migrations, files[index]), 'utf8'));
        sqlite.pragma(`user_version = ${index + 1}`);
      }
    }).immediate();
    return { sqlite, db: drizzle(sqlite, { schema }) };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export type Store = ReturnType<typeof openDatabase>;
