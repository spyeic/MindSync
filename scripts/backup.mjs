import { chmod, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import nextEnv from '@next/env';

async function backup() {
  process.umask(0o077);
  nextEnv.loadEnvConfig(process.cwd(), false);
  const source = resolve(process.env.DATABASE_PATH || './mindsync.db');
  const directory = resolve(process.env.BACKUP_DIR || './backups');
  const keep = Number(process.env.BACKUP_KEEP || '14');
  if (!Number.isInteger(keep) || keep < 1 || keep > 365) throw new Error('BACKUP_KEEP must be an integer from 1 to 365');

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `mindsync-${stamp}-${randomUUID().slice(0, 8)}.db`;
  const final = join(directory, name);
  const pending = `${final}.partial`;
  const sqlite = new Database(source, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    // SQLite's Online Backup API includes committed data from the live WAL.
    await sqlite.backup(pending);
    const check = new Database(pending, { fileMustExist: true });
    try {
      check.pragma('journal_mode = DELETE');
      if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Backup failed quick_check');
    } finally {
      check.close();
    }
    await chmod(pending, 0o600);
    await rename(pending, final);
  } finally {
    sqlite.close();
    for (const path of [pending, `${pending}-wal`, `${pending}-shm`, `${pending}-journal`]) {
      await rm(path, { force: true });
    }
  }
  const backups = (await readdir(directory)).filter((entry) =>
    /^mindsync-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}\.db$/.test(entry),
  ).sort().reverse();
  for (const entry of backups.slice(keep)) await rm(join(directory, entry), { force: true });
  console.log(`SQLite backup: ${final}`);
}

await backup();
