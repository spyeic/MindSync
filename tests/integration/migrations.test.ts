import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { GameEngine } from '../../server/game.ts';
import { openDatabase } from '../../server/db.ts';

it('migrates existing occupied rooms without changing completed history or persisted pauses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mindsync-migration-'));
  let store: ReturnType<typeof openDatabase> | undefined;
  try {
    const legacy = join(dir, 'legacy');
    mkdirSync(legacy);
    for (const name of ['0000_initial.sql', '0001_early_end.sql', '0002_game_pauses.sql']) {
      copyFileSync(join('drizzle', name), join(legacy, name));
    }
    const path = join(dir, 'test.db');
    store = openDatabase(path, legacy);
    store.sqlite.exec(`
      INSERT INTO players VALUES ('a', '甲', 0), ('b', '乙', 0);
      INSERT INTO rooms VALUES ('0836', 'request', 30, 15, 0), ('ABCD2345', 'legacy', 30, 15, 0);
      INSERT INTO room_members VALUES ('ABCD2345', 0, 'a', '甲'), ('ABCD2345', 1, 'b', '乙');
      INSERT INTO room_members VALUES ('0836', 0, 'a', '甲'), ('0836', 1, 'b', '乙');
      INSERT INTO games (id, code, player_a, player_b, name_a, name_b, seconds, max_rounds, phase, number, started_at, finished_at, transition_at, matched)
      VALUES ('old', 'ABCD2345', 'a', 'b', '甲', '乙', 30, 15, 'FINISHED', 1, 0, 1000, NULL, 1),
             ('retired', 'ABCD2345', 'a', 'b', '甲', '乙', 30, 15, 'PLAYING', 1, 1000, NULL, 31000, 0),
             ('active', '0836', 'a', 'b', '甲', '乙', 30, 15, 'PLAYING', 1, 2000, NULL, 63000, 0);
      INSERT INTO rounds VALUES ('old', 1, 0, 30000, 1000, 'matched'), ('active', 1, 2000, 32000, NULL, NULL);
      INSERT INTO rounds VALUES ('retired', 1, 1000, 31000, NULL, NULL);
      INSERT INTO submissions VALUES ('old', 1, 0, '海', '海', 500), ('old', 1, 1, '海', '海', 1000);
      INSERT INTO submissions VALUES ('retired', 1, 0, '月', '月', 1100);
      INSERT INTO game_pauses VALUES ('active', 3000, 63000, 29000);
    `);
    const submissions = store.sqlite.prepare('SELECT * FROM submissions').all();
    store.sqlite.close();
    store = openDatabase(path);
    expect(store.sqlite.pragma('user_version', { simple: true })).toBe(5);
    expect(store.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(store.sqlite.prepare('SELECT game_id FROM room_members ORDER BY seat').all()).toEqual([
      { game_id: 'active' }, { game_id: 'active' },
    ]);
    const engine = new GameEngine(store, () => 30_000);
    engine.recoverPresence();
    expect(engine.roomId('ABCD2345')).toBeUndefined();
    expect(engine.roomId('0836')).toBe('0836');
    expect(engine.detail('old', 'a')).toMatchObject({
      names: ['甲', '乙'], matched: true, history: [{ words: ['海', '海'] }],
    });
    expect(engine.detail('retired', 'b')).toMatchObject({
      endedEarly: true, history: [{ words: ['月', null] }],
    });
    expect(store.sqlite.prepare('SELECT * FROM submissions').all()).toEqual(submissions);
    expect(store.sqlite.prepare('SELECT remaining_ms FROM game_pauses').get()).toEqual({ remaining_ms: 29000 });
    store.sqlite.close();
    store = openDatabase(path);
    expect(store.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    if (store?.sqlite.open) store.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
