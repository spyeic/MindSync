import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Store } from '../../server/db.ts';
import { GameEngine } from '../../server/game.ts';
import { SessionService } from '../../server/session.ts';
import { roomCodeSchema } from '../../server/validation.ts';
import type { GameView } from '../../lib/protocol.ts';

let dir: string;
let path: string;
let store: Store;
let engine: GameEngine;
let now: number;
let a: string;
let b: string;
let other: string;

function identity() {
  const sessions = new SessionService(store, false);
  const cookie = sessions.ensure(undefined).cookie;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Lax');
  return sessions.read(cookie ?? '')!.id;
}

function create(maxRounds = 4) { return engine.create(a, '甲', { seconds: 10, maxRounds }, randomUUID()); }
function start(maxRounds?: number) {
  const code = create(maxRounds);
  engine.join(code, b, '乙');
  engine.command(code, a, { action: 'start' });
  return code;
}
function view(code: string, id = a) { return engine.view(code, id, `http://localhost/room/${code}`, () => false); }
function game(code: string): GameView { return view(code).game!; }
function submit(code: string, player: string, word: string, target = game(code)) {
  engine.command(code, player, { action: 'submit', gameId: target.id, round: target.number, word });
}
function review(code: string, player: string, accept: boolean) {
  const target = game(code);
  engine.command(code, player, { action: 'review', gameId: target.id, round: target.number, accept });
}
function step(ms: number) { now += ms; return engine.sweep(); }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mindsync-engine-'));
  path = join(dir, 'test.db');
  store = openDatabase(path);
  now = Date.UTC(2026, 10, 1);
  engine = new GameEngine(store, () => now);
  a = identity(); b = identity(); other = identity();
});

afterEach(() => {
  store.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('room and game transactions', () => {
  it('preserves leading zeros and reuses a freed code without sharing old room identity or history', () => {
    store.sqlite.exec(`
      WITH RECURSIVE codes(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM codes WHERE n < 9999)
      INSERT INTO rooms (id, public_code, request_id, seconds, max_rounds, created_at)
      SELECT 'seed-' || n, printf('%04d', n), 'seed', 30, 15, 0 FROM codes WHERE n <> 7;
    `);
    const code = start();
    expect(code).toBe('0007');
    expect(roomCodeSchema.parse(code)).toBe(code);
    expect(roomCodeSchema.safeParse('ABCD2345').success).toBe(false);
    expect(roomCodeSchema.safeParse('007').success).toBe(false);
    expect(() => create()).toThrow('没有可用房间码');

    const oldRoom = engine.roomId(code);
    const oldGame = game(code).id;
    engine.command(code, a, { action: 'end', gameId: oldGame });
    engine.syncPresence(code, () => false);
    expect(step(5000)).toEqual([code]);

    const reused = engine.create(other, '新房主', { seconds: 30, maxRounds: 15 }, randomUUID());
    expect(reused).toBe(code);
    expect(engine.roomId(reused)).not.toBe(oldRoom);
    expect(view(reused, other)).toMatchObject({ game: null, seat: 0 });
    expect(engine.member(reused, a)).toBeUndefined();
    expect(() => engine.detail(oldGame, other)).toThrow();
    expect(engine.detail(oldGame, a).endedEarly).toBe(true);
    expect(store.sqlite.pragma('foreign_key_check')).toEqual([]);
  });

  it('keeps a nonempty lobby, allows a refresh, and removes a lobby once both players stay away', () => {
    const code = create();
    engine.syncPresence(code, (id) => id === a);
    engine.join(code, b, '乙');
    engine.syncPresence(code, (id) => id === b);
    expect(step(10_000)).toEqual([]);
    engine.syncPresence(code, () => false);
    expect(step(4999)).toEqual([]);
    expect(engine.canJoin(code, b)).toBe(false);
    engine.syncPresence(code, (id) => id === b);
    expect(step(1)).toEqual([]);
    engine.syncPresence(code, () => false);
    expect(step(5000)).toEqual([code]);
    expect(() => engine.join(code, a, '甲')).toThrow('已自动删除');
    expect(engine.roomId(code)).toBeUndefined();
    expect(store.sqlite.prepare('SELECT count(*) FROM rooms').pluck().get()).toBe(0);
  });

  it('cleans up a room that the creator never enters', () => {
    const code = create();
    expect(step(59_999)).toEqual([]);
    expect(step(1)).toEqual([code]);
    expect(engine.roomId(code)).toBeUndefined();
  });

  it('creates once per request, prevents duplicate seats, restricts settings and rejects a third player', () => {
    const requestId = randomUUID();
    const settings = { seconds: 30, maxRounds: 15 };
    const code = engine.create(a, '甲', settings, requestId);
    expect(engine.create(a, '甲', settings, requestId)).toBe(code);
    engine.join(code, a, 'duplicate');
    expect(view(code).players[1]).toBeNull();
    expect(() => engine.command(code, a, { action: 'start' })).toThrow();
    engine.join(code, b, '乙');
    expect(view(code, b).seat).toBe(1);
    expect(() => engine.join(code, other, 'third')).toThrow();
    expect(() => engine.command(code, b, { action: 'start' })).toThrow();
    expect(() => engine.command(code, other, { action: 'start' })).toThrow();
    engine.command(code, a, { action: 'settings', settings: { seconds: 12, maxRounds: 2 } });
    engine.command(code, a, { action: 'start' });
    const id = game(code).id;
    engine.command(code, a, { action: 'start' });
    expect(game(code).id).toBe(id);
    expect(view(code).settings.seconds).toBe(12);
    expect(() => engine.command(code, a, { action: 'settings', settings })).toThrow();
  });

  it('keeps pending words private, rejects duplicate submissions, and fixes the reveal seat order', () => {
    const code = start();
    const target = game(code);
    submit(code, b, '秘密词语', target);
    expect(JSON.stringify(view(code))).not.toContain('秘密词语');
    expect(JSON.stringify(view(code, b))).not.toContain('秘密词语');
    expect(game(code).submitted).toEqual([false, true]);
    expect(engine.history(b, 1, 'newest').items).toEqual([]);
    expect(() => engine.detail(target.id, a)).toThrow();
    expect(() => submit(code, b, '替换')).toThrow();
    submit(code, a, '另一个词', target);
    expect(game(code).history).toEqual([{ number: 1, words: ['另一个词', '秘密词语'], result: 'different' }]);
    expect(step(1999)).toEqual([]);
    expect(step(1)).toEqual([code]);
    expect(step(0)).toEqual([]);
    expect(game(code).number).toBe(2);
    expect(game(code).prompt).toEqual(['另一个词', '秘密词语']);
  });

  it('finishes immediately on an exact match, including the final round', () => {
    const code = start(2);
    submit(code, a, '海');
    submit(code, b, '月亮');
    step(2000);
    submit(code, a, 'Apple');
    submit(code, b, 'apple');
    expect(game(code)).toMatchObject({ phase: 'FINISHED', number: 2, matched: true });
    expect(step(60000)).toEqual([]);
    expect(() => submit(code, b, '迟了')).toThrow();
    expect(engine.detail(game(code).id, a).matchWords).toEqual(['Apple', 'apple']);
    expect(() => engine.detail(game(code).id, other)).toThrow();
  });

  it('rejects a submission at the exact deadline, keeping the previous valid pair as the prompt', () => {
    const code = start(3);
    submit(code, a, '海');
    submit(code, b, '月亮');
    step(2000);
    const target = game(code);
    submit(code, a, '潮汐');
    now = target.deadline;
    expect(() => submit(code, b, '潮汐', target)).toThrow();
    expect(game(code).history.at(-1)).toEqual({ number: 2, words: ['潮汐', null], result: 'timeout' });
    step(2000);
    expect(game(code).prompt).toEqual(['海', '月亮']);
    step(12000);
    expect(game(code)).toMatchObject({ phase: 'FINISHED', number: 3, matched: false });
    expect(engine.detail(target.id, b).history.at(-1)?.words).toEqual([null, null]);
  });

  it('restores persisted state and catches up deadlines across a process restart', () => {
    const code = start(3);
    submit(code, a, '保留这个词');
    store.sqlite.close();
    now += 25000;
    store = openDatabase(path);
    engine = new GameEngine(store, () => now);
    expect(engine.sweep()).toEqual([code]);
    expect(game(code)).toMatchObject({ phase: 'PLAYING', number: 3, prompt: null });
    expect(game(code).history.map(({ words }) => words)).toEqual([['保留这个词', null], [null, null]]);
    step(11000);
    const id = game(code).id;
    store.sqlite.close();
    store = openDatabase(path);
    engine = new GameEngine(store, () => now);
    expect(engine.history(a, 1, 'newest').items[0]).toMatchObject({ id, roundsUsed: 3, matched: false });
  });

  it.each(['accept', 'reject', 'timeout'] as const)('resolves suspected typos with %s', (decision) => {
    const code = start(2);
    submit(code, a, '明信片');
    submit(code, b, '名信片');
    expect(game(code).phase).toBe('MATCH_REVIEW');
    review(code, a, true);
    expect(game(code).review).toEqual([true, null]);
    expect(() => review(code, a, false)).toThrow();
    if (decision === 'timeout') step(15000);
    else review(code, b, decision === 'accept');
    expect(game(code).phase).toBe(decision === 'accept' ? 'FINISHED' : 'PLAYING');
    expect(game(code).matched).toBe(decision === 'accept');
  });

  it('starts a new game only for the host once and preserves the old game', () => {
    const code = start(1);
    const id = game(code).id;
    expect(() => engine.command(code, a, { action: 'new-game', gameId: id })).toThrow('对局还在进行');
    submit(code, a, 'yes');
    submit(code, b, 'YES');
    const original = engine.detail(id, a);
    expect(() => engine.command(code, b, { action: 'new-game', gameId: id })).toThrow('只有房主');
    expect(game(code).id).toBe(id);
    engine.command(code, a, { action: 'new-game', gameId: id });
    const next = game(code);
    expect(next.id).not.toBe(id);
    expect(next).toMatchObject({ number: 1, history: [], phase: 'PLAYING' });
    expect(() => engine.command(code, a, { action: 'new-game', gameId: id })).toThrow();
    expect(() => engine.command(code, b, { action: 'end', gameId: id })).toThrow();
    expect(game(code).id).toBe(next.id);
    expect(engine.detail(id, a)).toEqual(original);
  });

  it('lets either seat settle early and reveals submitted words only after settlement', () => {
    const code = start();
    const target = game(code);
    submit(code, a, '潮汐', target);
    expect(JSON.stringify(view(code, b))).not.toContain('潮汐');
    expect(engine.history(b, 1, 'newest').items).toEqual([]);
    expect(() => engine.command(code, other, { action: 'end', gameId: target.id })).toThrow();
    engine.command(code, b, { action: 'end', gameId: target.id });
    const detail = engine.detail(target.id, b);
    expect(detail).toMatchObject({
      endedEarly: true, matched: false, roundsUsed: 1, history: [{ number: 1, words: ['潮汐', null] }],
    });
    engine.command(code, a, { action: 'end', gameId: target.id });
    expect(step(30_000)).toEqual([]);
    expect(() => submit(code, b, '潮汐', target)).toThrow();
    expect(engine.detail(target.id, b)).toEqual(detail);
  });

  it('freezes a round and resumes its remaining time when both players return', () => {
    const code = start();
    submit(code, a, '秘密词语');
    const original = game(code);
    now += 2000;
    engine.syncPresence(code, (id) => id === a);
    expect(game(code).pause).toEqual({ startedAt: now, deadline: now + 60_000, remainingMs: 8000 });
    expect(JSON.stringify(view(code, b))).not.toContain('秘密词语');
    expect(() => submit(code, a, '不允许')).toThrow('游戏已暂停');
    step(20_000);
    expect(game(code).number).toBe(1);
    engine.syncPresence(code, () => true);
    expect(game(code)).toMatchObject({ pause: null, deadline: now + 8000, submitted: [true, false] });
    expect(game(code).startedAt).toBe(original.startedAt);
    step(7999);
    submit(code, b, '秘密词语');
    expect(game(code)).toMatchObject({ matched: true, pause: null, phase: 'FINISHED' });
  });

  it('retains the original grace deadline when both players leave and settles exactly once', () => {
    const code = start();
    submit(code, a, '保留答案');
    engine.syncPresence(code, (id) => id === a);
    const pause = game(code).pause!;
    step(30_000);
    engine.syncPresence(code, () => false);
    engine.syncPresence(code, (id) => id === b);
    expect(game(code).pause).toEqual(pause);
    step(29_999);
    expect(game(code).phase).toBe('PLAYING');
    step(1);
    const result = engine.detail(game(code).id, a);
    expect(result).toMatchObject({
      finishedAt: pause.deadline, endedEarly: true, matched: false, history: [{ words: ['保留答案', null] }],
    });
    engine.syncPresence(code, () => true);
    expect(game(code)).toMatchObject({ phase: 'FINISHED', pause: null });
    expect(engine.sweep()).toEqual([]);
    expect(engine.detail(game(code).id, a)).toEqual(result);
  });

  it('treats a return at the grace deadline as too late and resumes a later departure with a fresh deadline', () => {
    const code = start();
    engine.syncPresence(code, () => false);
    step(5000);
    engine.syncPresence(code, () => true);
    now += 1000;
    engine.syncPresence(code, () => false);
    const pause = game(code).pause!;
    expect(pause).toMatchObject({ startedAt: now, remainingMs: 9000 });
    now = pause.deadline;
    engine.syncPresence(code, () => true);
    expect(engine.roomId(code)).toBeUndefined();
    expect(() => view(code)).toThrow('已自动删除');
  });

  it.each(['reveal', 'review'] as const)('pauses and restores the %s phase and its remaining time', (phase) => {
    const code = start();
    submit(code, a, phase === 'review' ? '草莓' : '海');
    submit(code, b, phase === 'review' ? '草梅' : '月亮');
    const original = game(code);
    now += 500;
    engine.syncPresence(code, () => false);
    expect(game(code).pause?.remainingMs).toBe((phase === 'review' ? 15_000 : 2000) - 500);
    if (phase === 'review') expect(() => review(code, a, true)).toThrow('游戏已暂停');
    step(20_000);
    expect(game(code).phase).toBe(original.phase);
    engine.syncPresence(code, () => true);
    expect(game(code).pause).toBeNull();
    if (phase === 'review') {
      review(code, a, true);
      review(code, b, true);
      expect(game(code).matched).toBe(true);
    } else {
      step(1500);
      expect(game(code)).toMatchObject({ number: 2, phase: 'PLAYING' });
    }
  });

  it('recovers persisted pauses on restart and settles them after their original deadline', () => {
    const code = start();
    engine.syncPresence(code, () => false);
    const { id, pause } = game(code);
    if (!pause) throw new Error('Expected pause');
    store.sqlite.close();
    now += 35_000;
    store = openDatabase(path);
    engine = new GameEngine(store, () => now);
    engine.recoverPresence();
    expect(game(code).pause).toEqual(pause);
    now = pause.deadline;
    engine.recoverPresence();
    expect(engine.detail(id, a)).toMatchObject({ endedEarly: true, finishedAt: pause.deadline });
    expect(engine.member(code, a)).toBeUndefined();
    expect(engine.member(code, b)).toBeUndefined();
  });

  it('restores a paused game after restart and permits ending it manually', () => {
    const code = start();
    now += 2000;
    engine.syncPresence(code, () => false);
    const pause = game(code).pause!;
    store.sqlite.close();
    now += 20_000;
    store = openDatabase(path);
    engine = new GameEngine(store, () => now);
    engine.recoverPresence();
    expect(game(code).pause).toEqual(pause);
    engine.syncPresence(code, () => true);
    expect(game(code)).toMatchObject({ pause: null, deadline: now + 8000 });
    engine.syncPresence(code, (id) => id === b);
    engine.command(code, b, { action: 'end', gameId: game(code).id });
    expect(game(code)).toMatchObject({ pause: null, phase: 'FINISHED', endedEarly: true });
    expect(step(60_000)).toEqual([]);
  });

  it.each(['matched', 'exhausted', 'manual', 'offline'] as const)('removes the offline guest after %s settlement and preserves history', (ending) => {
    const code = start(1);
    const id = game(code).id;
    if (ending === 'matched') {
      submit(code, a, '海');
      submit(code, b, '海');
    } else if (ending === 'exhausted') {
      step(12_000);
    } else {
      submit(code, a, '海');
      engine.syncPresence(code, (player) => player === a);
      if (ending === 'manual') engine.command(code, a, { action: 'end', gameId: id });
      else step(60_000);
    }
    engine.syncPresence(code, (player) => player === a);
    expect(engine.member(code, b)).toBeUndefined();
    expect(view(code).players).toEqual([{ name: '甲', online: false }, null]);
    expect(engine.canJoin(code, b)).toBe(true);
    expect(() => engine.command(code, a, { action: 'new-game', gameId: id })).toThrow('等另一位');
    expect(engine.history(b, 1, 'newest').items[0]?.id).toBe(id);
    expect(engine.detail(id, b).names).toEqual(['甲', '乙']);

    engine.join(code, other, '丙');
    engine.syncPresence(code, (player) => player === a);
    expect(engine.member(code, other)).toBeDefined();
    expect(view(code, other).game).toBeNull();
    expect(engine.history(other, 1, 'newest').items).toEqual([]);
    expect(() => engine.detail(id, other)).toThrow();
    now += 1;
    engine.command(code, a, { action: 'new-game', gameId: id });
    expect(game(code).names).toEqual(['甲', '丙']);
    submit(code, a, '月');
    submit(code, other, '月');
    expect(engine.history(a, 1, 'newest').items.map(({ names }) => names[1])).toEqual(['丙', '乙']);
    expect(engine.history(b, 1, 'newest').items).toHaveLength(1);
  });

  it('promotes the online guest and keeps the old game’s player order when reinviting', () => {
    const code = start();
    const id = game(code).id;
    submit(code, a, '海');
    engine.syncPresence(code, (player) => player === b);
    engine.command(code, b, { action: 'end', gameId: id });
    engine.syncPresence(code, (player) => player === b);
    expect(engine.member(code, a)).toBeUndefined();
    expect(view(code, b)).toMatchObject({ seat: 0, game: { names: ['甲', '乙'], history: [{ words: ['海', null] }] } });
    engine.join(code, other, '丙');
    engine.command(code, b, { action: 'new-game', gameId: id });
    const next = view(code, b).game!;
    expect(next.names).toEqual(['乙', '丙']);
    submit(code, b, '春', next);
    submit(code, other, '春', next);
    expect(engine.detail(next.id, b).seat).toBe(0);
    expect(engine.detail(id, b).seat).toBe(1);
    expect(engine.detail(id, a).history[0]?.words).toEqual(['海', null]);
  });

  it('settles and deletes an active room at the original grace deadline if both players are away', () => {
    const code = start();
    const { id } = game(code);
    submit(code, a, '保留答案');
    engine.syncPresence(code, (player) => player === a);
    step(20_000);
    engine.syncPresence(code, () => false);
    expect(step(39_999)).toEqual([]);
    expect(game(code).phase).toBe('PLAYING');
    expect(step(1)).toEqual([code]);
    expect(engine.roomId(code)).toBeUndefined();
    expect(engine.member(code, a)).toBeUndefined();
    expect(engine.member(code, b)).toBeUndefined();
    expect(() => engine.join(code, other, '新访客')).toThrow('已自动删除');
    expect(engine.detail(id, a)).toMatchObject({ endedEarly: true, history: [{ words: ['保留答案', null] }] });
    expect(engine.history(b, 1, 'newest').items[0]?.id).toBe(id);
  });

  it('marks a stopped match review as unmatched and lists only the participant’s completed games across rooms', () => {
    const code = start();
    submit(code, a, '草莓');
    submit(code, b, '草梅');
    const first = game(code);
    expect(first.phase).toBe('MATCH_REVIEW');
    review(code, a, true);
    engine.command(code, a, { action: 'end', gameId: first.id });
    expect(engine.detail(first.id, a)).toMatchObject({
      endedEarly: true, matched: false, history: [{ words: ['草莓', '草梅'], result: 'different' }],
    });
    step(1);
    engine.command(code, a, { action: 'new-game', gameId: first.id });
    const second = game(code);
    engine.command(code, b, { action: 'end', gameId: second.id });
    expect(engine.detail(second.id, b).history[0]?.words).toEqual([null, null]);
    engine.command(code, a, { action: 'new-game', gameId: second.id });
    const another = start(1);
    engine.command(another, a, { action: 'end', gameId: game(another).id });
    expect(engine.history(b, 1, 'newest').items.map(({ id }) => id)).toEqual([game(another).id, second.id, first.id]);
    expect(engine.history(b, 1, 'oldest').items.map(({ id }) => id)).toEqual([first.id, second.id, game(another).id]);
    expect(engine.history(other, 1, 'newest').items).toEqual([]);
  });
});
