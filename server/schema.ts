import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Phase, RoundResult, Seat } from '../lib/protocol.ts';

export const players = sqliteTable('players', {
  id: text().primaryKey(),
  nickname: text().notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  playerId: text('player_id').notNull().references(() => players.id),
  expiresAt: integer('expires_at').notNull(),
}, (t) => [index('sessions_expiry').on(t.expiresAt)]);

export const rooms = sqliteTable('rooms', {
  id: text().primaryKey(),
  publicCode: text('public_code'),
  emptyDeadline: integer('empty_deadline'),
  requestId: text('request_id').notNull(),
  seconds: integer().notNull(),
  maxRounds: integer('max_rounds').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('rooms_request').on(t.requestId),
  uniqueIndex('rooms_public_code').on(t.publicCode),
  index('rooms_empty_deadline').on(t.emptyDeadline),
  check('rooms_public_code_format', sql`${t.publicCode} IS NULL OR ${t.publicCode} GLOB '[0-9][0-9][0-9][0-9]'`),
  check('room_seconds_range', sql`${t.seconds} BETWEEN 10 AND 120`),
  check('room_rounds_range', sql`${t.maxRounds} BETWEEN 1 AND 50`),
]);

export const roomMembers = sqliteTable('room_members', {
  roomId: text('room_id').notNull().references(() => rooms.id),
  seat: integer().$type<Seat>().notNull(),
  playerId: text('player_id').notNull().references(() => players.id),
  nickname: text().notNull(),
  gameId: text('game_id').references(() => games.id),
}, (t) => [
  primaryKey({ columns: [t.roomId, t.seat] }),
  uniqueIndex('room_player_once').on(t.roomId, t.playerId),
  check('room_seat_range', sql`${t.seat} IN (0, 1)`),
]);

export const games = sqliteTable('games', {
  sequence: integer().primaryKey({ autoIncrement: true }),
  id: text().notNull().unique(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  playerA: text('player_a').notNull().references(() => players.id),
  playerB: text('player_b').notNull().references(() => players.id),
  nameA: text('name_a').notNull(),
  nameB: text('name_b').notNull(),
  seconds: integer().notNull(),
  maxRounds: integer('max_rounds').notNull(),
  phase: text().$type<Phase>().notNull(),
  number: integer().notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  transitionAt: integer('transition_at'),
  matched: integer({ mode: 'boolean' }).notNull().default(false),
  endedEarly: integer('ended_early', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  index('games_room_latest').on(t.roomId, t.sequence),
  index('games_history_a').on(t.playerA, t.finishedAt),
  index('games_history_b').on(t.playerB, t.finishedAt),
  index('games_room_history').on(t.roomId, t.finishedAt, t.sequence),
  index('games_due').on(t.transitionAt).where(sql`${t.finishedAt} IS NULL`),
  uniqueIndex('games_room_active').on(t.roomId).where(sql`${t.finishedAt} IS NULL`),
  check('game_phase', sql`${t.phase} IN ('PLAYING', 'REVEALING', 'MATCH_REVIEW', 'FINISHED')`),
  check('games_early_end', sql`${t.endedEarly} = 0 OR (${t.endedEarly} = 1 AND ${t.phase} = 'FINISHED' AND ${t.matched} = 0)`),
  check('game_timing', sql`(${t.phase} = 'FINISHED' AND ${t.finishedAt} IS NOT NULL AND ${t.transitionAt} IS NULL)
    OR (${t.phase} <> 'FINISHED' AND ${t.finishedAt} IS NULL AND ${t.transitionAt} IS NOT NULL)`),
]);

export const rounds = sqliteTable('rounds', {
  gameId: text('game_id').notNull().references(() => games.id),
  number: integer().notNull(),
  startedAt: integer('started_at').notNull(),
  deadline: integer().notNull(),
  revealedAt: integer('revealed_at'),
  result: text().$type<RoundResult>(),
}, (t) => [
  primaryKey({ columns: [t.gameId, t.number] }),
  check('round_result', sql`${t.result} IN ('different', 'timeout', 'candidate', 'matched')`),
  check('round_reveal', sql`(${t.revealedAt} IS NULL) = (${t.result} IS NULL)`),
]);

export const gamePauses = sqliteTable('game_pauses', {
  gameId: text('game_id').primaryKey().references(() => games.id),
  startedAt: integer('started_at').notNull(),
  deadline: integer().notNull(),
  remainingMs: integer('remaining_ms').notNull(),
}, (t) => [
  check('pause_duration', sql`${t.deadline} = ${t.startedAt} + 60000`),
  check('pause_remaining', sql`${t.remainingMs} >= 0`),
]);

export const submissions = sqliteTable('submissions', {
  gameId: text('game_id').notNull(),
  number: integer().notNull(),
  seat: integer().$type<Seat>().notNull(),
  word: text().notNull(),
  normalized: text().notNull(),
  submittedAt: integer('submitted_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.gameId, t.number, t.seat] }),
  foreignKey({ columns: [t.gameId, t.number], foreignColumns: [rounds.gameId, rounds.number] }),
  check('submission_seat', sql`${t.seat} IN (0, 1)`),
]);

export const matchReviews = sqliteTable('match_reviews', {
  gameId: text('game_id').notNull(),
  number: integer().notNull(),
  seat: integer().$type<Seat>().notNull(),
  accept: integer({ mode: 'boolean' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.gameId, t.number, t.seat] }),
  foreignKey({ columns: [t.gameId, t.number], foreignColumns: [rounds.gameId, rounds.number] }),
  check('review_seat', sql`${t.seat} IN (0, 1)`),
]);
