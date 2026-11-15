import { randomInt, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type {
  GameCommand, GameDetail, GameSummary, GameView, HistoryPage, Pair,
  RevealedRound, RoomView, RoundResult, Seat, Settings,
} from '../lib/protocol.ts';
import type { Store } from './db.ts';
import { AppError } from './errors.ts';
import { compareNormalized, normalizeWord } from './matcher.ts';
import { gamePauses, games, matchReviews, roomMembers, rooms, rounds, submissions } from './schema.ts';

type Game = typeof games.$inferSelect;
type Round = typeof rounds.$inferSelect;
type Room = typeof rooms.$inferSelect;
type Member = typeof roomMembers.$inferSelect;
type GameReader = Pick<Store['db'], 'select' | 'insert' | 'update'>;
type Tx = Parameters<Parameters<Store['db']['transaction']>[0]>[0];

const roomCodeCount = 10_000;
const formatRoomCode = (number: number) => String(number).padStart(4, '0');
const revealMs = 2000;
const reviewMs = 15000;
const pauseMs = 60_000;
const emptyRoomMs = 5000;
const initialJoinMs = 60_000;
const historyPageSize = 12;
const participant = (playerId: string) => or(eq(games.playerA, playerId), eq(games.playerB, playerId));
const seats = <T>(values: { seat: Seat; value: T }[], fallback: T): Pair<T> => {
  const pair: Pair<T> = [fallback, fallback];
  for (const { seat, value } of values) pair[seat] = value;
  return pair;
};

export class GameEngine {
  private readonly store: Store;
  private readonly clock: () => number;

  constructor(store: Store, clock: () => number = Date.now) {
    this.store = store;
    this.clock = clock;
  }

  create(playerId: string, nickname: string, settings: Settings, requestId: string) {
    return this.store.db.transaction((tx) => {
      const existing = tx.select({ code: rooms.publicCode, deadline: rooms.emptyDeadline }).from(rooms)
        .innerJoin(roomMembers, eq(roomMembers.roomId, rooms.id))
        .where(and(eq(rooms.requestId, requestId), eq(roomMembers.playerId, playerId), eq(roomMembers.seat, 0), isNotNull(rooms.publicCode))).get();
      const now = this.clock();
      if (existing?.code && (existing.deadline === null || existing.deadline > now)) return existing.code;
      let code = formatRoomCode(randomInt(roomCodeCount));
      if (this.findRoom(tx, code)) {
        const occupied = new Set(tx.select({ code: rooms.publicCode }).from(rooms)
          .where(isNotNull(rooms.publicCode)).all().map((room) => room.code));
        const available = Array.from({ length: roomCodeCount }, (_, index) => formatRoomCode(index))
          .filter((candidate) => !occupied.has(candidate));
        if (!available.length) throw new AppError(503, 'ROOM_CREATE', '目前没有可用房间码，请稍后再试。');
        code = available[randomInt(available.length)];
      }
      const roomId = randomUUID();
      tx.insert(rooms).values({
        id: roomId, publicCode: code, ...settings, requestId, createdAt: now, emptyDeadline: now + initialJoinMs,
      }).run();
      tx.insert(roomMembers).values({ roomId, playerId, nickname, seat: 0 }).run();
      return code;
    }, { behavior: 'immediate' });
  }

  join(code: string, playerId: string, nickname: string) {
    this.store.db.transaction((tx) => {
      const { id: roomId } = this.requireRoom(tx, code);
      const members = this.members(tx, roomId);
      if (members.some((member) => member.playerId === playerId)) return;
      if (members.length === 2) throw new AppError(409, 'ROOM_FULL', '这个房间已经满员。');
      const game = this.latest(tx, roomId);
      if (game && game.phase !== 'FINISHED') throw new AppError(409, 'GAME_STARTED', '对局已经开始。');
      const seat = members.some((member) => member.seat === 0) ? 1 : 0;
      tx.insert(roomMembers).values({ roomId, playerId, nickname, seat }).run();
    }, { behavior: 'immediate' });
  }

  canJoin(code: string, playerId: string) {
    const { id: roomId } = this.requireRoom(this.store.db, code);
    const members = this.members(this.store.db, roomId);
    if (members.some((member) => member.playerId === playerId)) return false;
    if (members.length === 2) throw new AppError(409, 'ROOM_FULL', '这个房间已经满员。');
    const game = this.latest(this.store.db, roomId);
    if (game && game.phase !== 'FINISHED') throw new AppError(409, 'GAME_STARTED', '对局已经开始。');
    return true;
  }

  roomId(code: string) {
    return this.findRoom(this.store.db, code)?.id;
  }

  member(code: string, playerId: string) {
    const room = this.findRoom(this.store.db, code);
    if (!room || this.isExpired(room, this.clock())) return undefined;
    return this.members(this.store.db, room.id).find((member) => member.playerId === playerId);
  }

  private findRoom(db: GameReader, code: string) {
    return db.select().from(rooms).where(eq(rooms.publicCode, code)).get();
  }

  private isExpired(room: Room, now: number) {
    return room.emptyDeadline !== null && room.emptyDeadline <= now;
  }

  private requireRoom(db: GameReader, code: string) {
    const room = this.findRoom(db, code);
    if (!room || this.isExpired(room, this.clock())) {
      throw new AppError(404, 'ROOM_MISSING', '找不到这个房间，可能已自动删除。');
    }
    return room;
  }

  private members(db: GameReader, roomId: string) {
    return db.select().from(roomMembers).where(eq(roomMembers.roomId, roomId)).orderBy(roomMembers.seat).all();
  }

  private latest(db: GameReader, roomId: string) {
    return db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.sequence)).get();
  }

  private currentRound(db: GameReader, game: Game) {
    const round = db.select().from(rounds).where(and(eq(rounds.gameId, game.id), eq(rounds.number, game.number))).get();
    if (!round) throw new Error('Current round missing');
    return round;
  }

  private addRound(tx: Tx, gameId: string, number: number, at: number, seconds: number) {
    tx.insert(rounds).values({ gameId, number, startedAt: at, deadline: at + seconds * 1000 }).run();
  }

  private newGame(tx: Tx, room: Room, members: Member[], at: number) {
    const [a, b] = members;
    if (!a || !b) throw new AppError(409, 'NEED_TWO', '等另一位玩家加入后再开始。');
    const id = randomUUID();
    tx.insert(games).values({
      id, roomId: room.id, playerA: a.playerId, playerB: b.playerId, nameA: a.nickname, nameB: b.nickname,
      seconds: room.seconds, maxRounds: room.maxRounds, phase: 'PLAYING', number: 1,
      startedAt: at, transitionAt: at + room.seconds * 1000,
    }).run();
    tx.update(roomMembers).set({ gameId: id }).where(eq(roomMembers.roomId, room.id)).run();
    tx.update(rooms).set({ emptyDeadline: null }).where(eq(rooms.id, room.id)).run();
    this.addRound(tx, id, 1, at, room.seconds);
  }

  private finish(tx: Tx, game: Game, at: number, matched: boolean, endedEarly = false) {
    tx.delete(gamePauses).where(eq(gamePauses.gameId, game.id)).run();
    tx.update(games).set({ phase: 'FINISHED', transitionAt: null, finishedAt: at, matched, endedEarly })
      .where(eq(games.id, game.id)).run();
  }

  private endEarly(tx: Tx, game: Game, at: number) {
    if (game.phase === 'FINISHED') return;
    const round = this.currentRound(tx, game);
    if (round.result === null || round.result === 'candidate') {
      tx.update(rounds).set({ revealedAt: round.revealedAt ?? at, result: 'different' })
        .where(and(eq(rounds.gameId, game.id), eq(rounds.number, game.number))).run();
    }
    this.finish(tx, game, at, false, true);
  }

  private reveal(tx: Tx, game: Game, round: Round, at: number) {
    const answers = tx.select().from(submissions)
      .where(and(eq(submissions.gameId, game.id), eq(submissions.number, round.number))).all();
    const result: RoundResult = answers.length === 2
      ? compareNormalized(answers[0].normalized, answers[1].normalized)
      : 'timeout';
    tx.update(rounds).set({ revealedAt: at, result })
      .where(and(eq(rounds.gameId, game.id), eq(rounds.number, round.number))).run();
    if (result === 'matched') {
      this.finish(tx, game, at, true);
      return;
    }
    const candidate = result === 'candidate';
    tx.update(games).set({ phase: candidate ? 'MATCH_REVIEW' : 'REVEALING', transitionAt: at + (candidate ? reviewMs : revealMs) })
      .where(eq(games.id, game.id)).run();
  }

  private endReview(tx: Tx, game: Game, at: number, matched: boolean) {
    tx.update(rounds).set({ result: matched ? 'matched' : 'different' })
      .where(and(eq(rounds.gameId, game.id), eq(rounds.number, game.number))).run();
    if (matched) this.finish(tx, game, at, true);
    else this.nextRound(tx, game, at);
  }

  private nextRound(tx: Tx, game: Game, at: number) {
    if (game.number >= game.maxRounds) {
      this.finish(tx, game, at, false);
      return;
    }
    const number = game.number + 1;
    this.addRound(tx, game.id, number, at, game.seconds);
    tx.update(games).set({ phase: 'PLAYING', number, transitionAt: at + game.seconds * 1000 })
      .where(eq(games.id, game.id)).run();
  }

  private advance(tx: Tx, roomId: string, now: number) {
    let game = this.latest(tx, roomId);
    // Replay from persisted transition times, including time elapsed while the process was down.
    while (game && game.transitionAt !== null && game.transitionAt <= now) {
      const at = game.transitionAt;
      if (tx.select().from(gamePauses).where(eq(gamePauses.gameId, game.id)).get()) {
        this.endEarly(tx, game, at);
        return this.latest(tx, roomId);
      }
      switch (game.phase) {
        case 'PLAYING': this.reveal(tx, game, this.currentRound(tx, game), at); break;
        case 'MATCH_REVIEW': this.endReview(tx, game, at, false); break;
        case 'REVEALING': this.nextRound(tx, game, at); break;
        case 'FINISHED': throw new Error('Finished game has a pending transition');
      }
      game = this.latest(tx, roomId);
    }
    return game;
  }

  private closeRoom(tx: Tx, room: Room, game: Game | undefined) {
    tx.delete(roomMembers).where(eq(roomMembers.roomId, room.id)).run();
    if (game) {
      // Retain only the internal identity that existing game history references.
      tx.update(rooms).set({ publicCode: null, emptyDeadline: null }).where(eq(rooms.id, room.id)).run();
    } else {
      tx.delete(rooms).where(eq(rooms.id, room.id)).run();
    }
  }

  sweep() {
    const now = this.clock();
    const dueGames = this.store.db.select({ id: rooms.id, code: rooms.publicCode }).from(games)
      .innerJoin(rooms, eq(games.roomId, rooms.id))
      .where(and(isNull(games.finishedAt), lte(games.transitionAt, now), isNotNull(rooms.publicCode))).all();
    const emptyRooms = this.store.db.select({ id: rooms.id, code: rooms.publicCode }).from(rooms)
      .where(lte(rooms.emptyDeadline, now)).all();
    const due = new Map([...dueGames, ...emptyRooms].map((room) => [room.id, room.code]));
    for (const roomId of due.keys()) {
      this.store.db.transaction((tx) => {
        const room = tx.select().from(rooms).where(eq(rooms.id, roomId)).get();
        if (!room) return;
        const game = this.advance(tx, roomId, now);
        if (this.isExpired(room, now) && (!game || game.phase === 'FINISHED')) this.closeRoom(tx, room, game);
      }, { behavior: 'immediate' });
    }
    return [...due.values()].filter((code) => code !== null);
  }

  syncPresence(code: string, isOnline: (playerId: string) => boolean) {
    this.store.db.transaction((tx) => {
      const room = this.findRoom(tx, code);
      if (!room) return;
      const now = this.clock();
      const game = this.advance(tx, room.id, now);
      if (this.isExpired(room, now) && (!game || game.phase === 'FINISHED')) {
        this.closeRoom(tx, room, game);
        return;
      }

      const members = this.members(tx, room.id);
      const hasOnlinePlayer = members.some((member) => isOnline(member.playerId));
      let emptyDeadline: number | null = null;
      if (game && game.transitionAt !== null) {
        const pauseDeadline = this.syncGamePause(tx, game, game.transitionAt, now, isOnline);
        if (!hasOnlinePlayer) emptyDeadline = pauseDeadline;
      } else if (!hasOnlinePlayer) {
        // Give reloads a short window to reconnect to a lobby or result page.
        emptyDeadline = room.emptyDeadline ?? now + emptyRoomMs;
      } else if (game) {
        this.removeOfflinePlayers(tx, room.id, game.id, members, isOnline);
      }

      if (emptyDeadline !== room.emptyDeadline) {
        tx.update(rooms).set({ emptyDeadline }).where(eq(rooms.id, room.id)).run();
      }
    }, { behavior: 'immediate' });
  }

  private removeOfflinePlayers(tx: Tx, roomId: string, gameId: string, members: Member[], isOnline: (id: string) => boolean) {
    // Freshly invited members are unattached to the finished game until the next start.
    for (const member of members) {
      if (member.gameId === gameId && !isOnline(member.playerId)) {
        tx.delete(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.playerId, member.playerId))).run();
      }
    }
    const remaining = this.members(tx, roomId);
    if (remaining.length === 1 && remaining[0].seat === 1) {
      tx.update(roomMembers).set({ seat: 0 }).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.seat, 1))).run();
    }
  }

  private syncGamePause(tx: Tx, game: Game, transitionAt: number, now: number, isOnline: (id: string) => boolean) {
    const pause = tx.select().from(gamePauses).where(eq(gamePauses.gameId, game.id)).get();
    const bothOnline = isOnline(game.playerA) && isOnline(game.playerB);
    if (bothOnline) {
      if (pause) {
        const resumedDeadline = now + pause.remainingMs;
        if (game.phase === 'PLAYING') {
          tx.update(rounds).set({ deadline: resumedDeadline })
            .where(and(eq(rounds.gameId, game.id), eq(rounds.number, game.number))).run();
        }
        tx.update(games).set({ transitionAt: resumedDeadline }).where(eq(games.id, game.id)).run();
        tx.delete(gamePauses).where(eq(gamePauses.gameId, game.id)).run();
      }
      return null;
    }
    if (pause) return pause.deadline;
    const deadline = now + pauseMs;
    tx.insert(gamePauses).values({
      gameId: game.id, startedAt: now, deadline, remainingMs: transitionAt - now,
    }).run();
    tx.update(games).set({ transitionAt: deadline }).where(eq(games.id, game.id)).run();
    return deadline;
  }

  recoverPresence() {
    // Retired codes are unreachable. Preserve unfinished legacy games as settled history.
    this.store.db.transaction((tx) => {
      const retired = tx.select({ game: games }).from(games).innerJoin(rooms, eq(games.roomId, rooms.id))
        .where(and(isNull(rooms.publicCode), isNull(games.finishedAt))).all();
      const now = this.clock();
      for (const { game } of retired) this.endEarly(tx, game, now);
    }, { behavior: 'immediate' });
    const active = this.store.db.select({ code: rooms.publicCode }).from(rooms).where(isNotNull(rooms.publicCode)).all();
    for (const { code } of active) {
      if (code !== null) this.syncPresence(code, () => false);
    }
  }

  command(code: string, playerId: string, command: GameCommand) {
    const outcome = this.store.db.transaction((tx) => {
      const room = this.requireRoom(tx, code);
      const members = this.members(tx, room.id);
      const member = members.find((item) => item.playerId === playerId);
      if (!member) throw new AppError(403, 'ROOM_FORBIDDEN', '你没有这个房间的席位。');
      const now = this.clock();
      const game = this.advance(tx, room.id, now);
      // Commit due transitions even when the incoming command has become stale.
      try {
        this.applyCommand(tx, room, members, member, game, command, now);
        return null;
      } catch (error) {
        if (error instanceof AppError) return error;
        throw error;
      }
    }, { behavior: 'immediate' });
    if (outcome) throw outcome;
  }

  private applyCommand(tx: Tx, room: Room, members: Member[], member: Member, game: Game | undefined, command: GameCommand, now: number) {
    if (command.action === 'settings' || command.action === 'start') {
      if (member.seat !== 0) throw new AppError(403, 'HOST_ONLY', '只有房主可以执行此操作。');
      if (command.action === 'start') {
        if (!game || (game.phase === 'FINISHED' && member.gameId !== game.id)) this.newGame(tx, room, members, now);
      } else {
        if (game && (game.phase !== 'FINISHED' || member.gameId === game.id)) {
          throw new AppError(409, 'SETTINGS_LOCKED', '游戏开始后，设置已经锁定。');
        }
        tx.update(rooms).set(command.settings).where(eq(rooms.id, room.id)).run();
      }
      return;
    }

    if (!game || command.gameId !== game.id) throw new AppError(409, 'STALE_GAME', '对局已更新，请查看当前状态。');
    if (command.action === 'end') {
      this.endEarly(tx, game, now);
      return;
    }
    if (command.action === 'new-game') {
      if (member.seat !== 0) throw new AppError(403, 'HOST_ONLY', '只有房主可以开启新局。');
      if (game.phase !== 'FINISHED') throw new AppError(409, 'STILL_PLAYING', '对局还在进行。');
      this.newGame(tx, room, members, now);
      return;
    }

    if (tx.select().from(gamePauses).where(eq(gamePauses.gameId, game.id)).get()) {
      throw new AppError(409, 'GAME_PAUSED', '游戏已暂停，等待双方重新在线。');
    }
    if (command.round !== game.number) throw new AppError(409, 'STALE_ROUND', '这一回合已经结束。');
    const round = this.currentRound(tx, game);
    if (command.action === 'submit') {
      if (game.phase !== 'PLAYING' || now >= round.deadline) throw new AppError(409, 'ROUND_CLOSED', '这一回合已停止接收答案。');
      const written = tx.insert(submissions).values({
        gameId: game.id, number: round.number, seat: member.seat, word: command.word,
        normalized: normalizeWord(command.word), submittedAt: now,
      }).onConflictDoNothing().run();
      if (!written.changes) throw new AppError(409, 'ALREADY_SUBMITTED', '你已经提交过这一回合的词语。');
      const answers = tx.select({ seat: submissions.seat }).from(submissions)
        .where(and(eq(submissions.gameId, game.id), eq(submissions.number, round.number))).all();
      if (answers.length === 2) this.reveal(tx, game, round, now);
      return;
    }

    if (game.phase !== 'MATCH_REVIEW') throw new AppError(409, 'REVIEW_CLOSED', '确认阶段已结束。');
    const vote = tx.insert(matchReviews).values({ gameId: game.id, number: round.number, seat: member.seat, accept: command.accept })
      .onConflictDoNothing().run();
    if (!vote.changes) throw new AppError(409, 'ALREADY_VOTED', '你已经确认过这组词语。');
    const votes = tx.select().from(matchReviews)
      .where(and(eq(matchReviews.gameId, game.id), eq(matchReviews.number, round.number))).all();
    if (!command.accept || votes.length === 2) this.endReview(tx, game, now, command.accept);
  }

  private revealed(gameId: string): RevealedRound[] {
    // Only revealed rows can join the answers. The active round is never serialized here.
    const rows = this.store.db.select({
      number: rounds.number, result: rounds.result, seat: submissions.seat, word: submissions.word,
    }).from(rounds).leftJoin(submissions, and(eq(submissions.gameId, rounds.gameId), eq(submissions.number, rounds.number)))
      .where(and(eq(rounds.gameId, gameId), isNotNull(rounds.revealedAt))).orderBy(asc(rounds.number)).all();
    const history = new Map<number, RevealedRound>();
    for (const row of rows) {
      if (!row.result) throw new Error('Revealed round has no result');
      const entry = history.get(row.number) ?? { number: row.number, result: row.result, words: [null, null] };
      if (row.seat !== null) entry.words[row.seat] = row.word;
      history.set(row.number, entry);
    }
    return [...history.values()];
  }

  private gameView(game: Game): GameView {
    const round = this.currentRound(this.store.db, game);
    const history = this.revealed(game.id);
    const pause = this.store.db.select({
      startedAt: gamePauses.startedAt, deadline: gamePauses.deadline, remainingMs: gamePauses.remainingMs,
    }).from(gamePauses).where(eq(gamePauses.gameId, game.id)).get() ?? null;
    const previous = history.findLast((item) => item.number < game.number && item.words.every((word) => word !== null));
    const submitted = this.store.db.select({ seat: submissions.seat }).from(submissions)
      .where(and(eq(submissions.gameId, game.id), eq(submissions.number, round.number))).all();
    const votes = game.phase === 'MATCH_REVIEW'
      ? this.store.db.select({ seat: matchReviews.seat, value: matchReviews.accept }).from(matchReviews)
        .where(and(eq(matchReviews.gameId, game.id), eq(matchReviews.number, round.number))).all()
      : [];
    return {
      id: game.id, names: [game.nameA, game.nameB], phase: game.phase, number: game.number, startedAt: game.startedAt, roundStartedAt: round.startedAt,
      deadline: round.deadline, transitionAt: game.transitionAt, finishedAt: game.finishedAt, matched: game.matched,
      endedEarly: game.endedEarly,
      pause,
      submitted: seats(submitted.map(({ seat }) => ({ seat, value: true })), false),
      review: seats<boolean | null>(votes, null),
      history, prompt: previous?.words[0] != null && previous.words[1] != null ? [previous.words[0], previous.words[1]] : null,
    };
  }

  view(code: string, playerId: string, inviteUrl: string, isOnline: (playerId: string) => boolean): RoomView {
    const room = this.requireRoom(this.store.db, code);
    const members = this.members(this.store.db, room.id);
    const member = members.find((item) => item.playerId === playerId);
    if (!member) throw new AppError(403, 'ROOM_FORBIDDEN', '你没有这个房间的席位。');
    const game = this.latest(this.store.db, room.id);
    return {
      code, inviteUrl, serverNow: this.clock(), seat: member.seat,
      players: seats(members.map((item) => ({ seat: item.seat, value: { name: item.nickname, online: isOnline(item.playerId) } })), null),
      settings: { seconds: room.seconds, maxRounds: room.maxRounds },
      game: game && member.gameId === game.id ? this.gameView(game) : null,
    };
  }

  history(playerId: string, page: number, order: HistoryPage['order']): HistoryPage {
    const sort = order === 'oldest' ? asc : desc;
    const results = this.store.db.select().from(games)
      .where(and(isNotNull(games.finishedAt), participant(playerId)))
      .orderBy(sort(games.finishedAt), sort(games.sequence)).limit(historyPageSize + 1).offset((page - 1) * historyPageSize).all();
    return {
      items: results.slice(0, historyPageSize).map((game) => this.summary(game, playerId)),
      page, hasMore: results.length > historyPageSize, order,
    };
  }

  detail(id: string, playerId: string): GameDetail {
    const game = this.store.db.select().from(games).where(and(eq(games.id, id), isNotNull(games.finishedAt),
      participant(playerId))).get();
    if (!game) throw new AppError(404, 'HISTORY_MISSING', '找不到这场已结束的对局。');
    const history = this.revealed(id);
    return { ...this.summary(game, playerId, history), history };
  }

  private summary(game: Game, playerId: string, history?: RevealedRound[]): GameSummary {
    if (game.finishedAt === null) throw new Error('Incomplete game cannot appear in history');
    const matchWords = game.matched ? (history ?? this.revealed(game.id)).at(-1)?.words ?? null : null;
    return {
      id: game.id, names: [game.nameA, game.nameB], seat: game.playerA === playerId ? 0 : 1,
      startedAt: game.startedAt, finishedAt: game.finishedAt, roundsUsed: game.number, maxRounds: game.maxRounds,
      matched: game.matched, endedEarly: game.endedEarly, matchWords,
    };
  }
}
