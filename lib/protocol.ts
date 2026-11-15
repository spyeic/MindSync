export type Seat = 0 | 1;
export type Settings = { seconds: number; maxRounds: number };
export const DEFAULT_SETTINGS: Settings = { seconds: 30, maxRounds: 15 };
export type Phase = 'PLAYING' | 'REVEALING' | 'MATCH_REVIEW' | 'FINISHED';
export type RoundResult = 'different' | 'timeout' | 'candidate' | 'matched';
export type PlayerView = { name: string; online: boolean };
export type Pair<T> = [T, T];

export type RevealedRound = {
  number: number;
  words: Pair<string | null>;
  result: RoundResult;
};

export type GameSummary = {
  id: string;
  names: Pair<string>;
  seat: Seat;
  startedAt: number;
  finishedAt: number;
  roundsUsed: number;
  maxRounds: number;
  matched: boolean;
  endedEarly: boolean;
  matchWords: Pair<string | null> | null;
};

export type GameDetail = GameSummary & { history: RevealedRound[] };
export type HistoryPage = { items: GameSummary[]; page: number; hasMore: boolean; order: 'newest' | 'oldest' };
export type GamePause = { startedAt: number; deadline: number; remainingMs: number };

export type GameView = {
  id: string;
  names: Pair<string>;
  phase: Phase;
  number: number;
  startedAt: number;
  roundStartedAt: number;
  deadline: number;
  transitionAt: number | null;
  finishedAt: number | null;
  matched: boolean;
  endedEarly: boolean;
  pause: GamePause | null;
  submitted: Pair<boolean>;
  review: Pair<boolean | null>;
  history: RevealedRound[];
  prompt: Pair<string> | null;
};

export type RoomView = {
  code: string;
  inviteUrl: string;
  serverNow: number;
  seat: Seat;
  players: Pair<PlayerView | null>;
  settings: Settings;
  game: GameView | null;
};

export type Failure = { ok: false; error: string; code: string };
export type Reply<T> = { ok: true; data: T } | Failure;
export type Ack<T> = (reply: Reply<T>) => void;
export type GameCommand =
  | { action: 'settings'; settings: Settings }
  | { action: 'start' }
  | { action: 'submit'; gameId: string; round: number; word: string }
  | { action: 'review'; gameId: string; round: number; accept: boolean }
  | { action: 'end'; gameId: string }
  | { action: 'new-game'; gameId: string };

export interface ClientEvents {
  'room:watch': (payload: { code: string }, ack: Ack<RoomView>) => void;
  'room:command': (payload: GameCommand, ack: Ack<null>) => void;
}
export interface ServerEvents {
  'room:state': (snapshot: RoomView) => void;
}
