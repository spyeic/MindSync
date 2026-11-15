CREATE TABLE players (id TEXT PRIMARY KEY NOT NULL, nickname TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY NOT NULL, player_id TEXT NOT NULL REFERENCES players(id), expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE rooms (
  code TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  seconds INTEGER NOT NULL CHECK (seconds BETWEEN 10 AND 120),
  max_rounds INTEGER NOT NULL CHECK (max_rounds BETWEEN 1 AND 50),
  created_at INTEGER NOT NULL
);
CREATE INDEX rooms_request ON rooms(request_id);
CREATE TABLE room_members (
  code TEXT NOT NULL REFERENCES rooms(code),
  seat INTEGER NOT NULL CHECK (seat IN (0, 1)),
  player_id TEXT NOT NULL REFERENCES players(id),
  nickname TEXT NOT NULL,
  PRIMARY KEY (code, seat)
);
CREATE UNIQUE INDEX room_player_once ON room_members(code, player_id);

CREATE TABLE games (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL REFERENCES rooms(code),
  player_a TEXT NOT NULL REFERENCES players(id),
  player_b TEXT NOT NULL REFERENCES players(id),
  name_a TEXT NOT NULL,
  name_b TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  max_rounds INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('PLAYING', 'REVEALING', 'MATCH_REVIEW', 'FINISHED')),
  number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  transition_at INTEGER,
  matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1)),
  CHECK ((phase = 'FINISHED' AND finished_at IS NOT NULL AND transition_at IS NULL)
    OR (phase <> 'FINISHED' AND finished_at IS NULL AND transition_at IS NOT NULL))
);
CREATE INDEX games_room_latest ON games(code, sequence);
CREATE INDEX games_history_a ON games(player_a, finished_at);
CREATE INDEX games_history_b ON games(player_b, finished_at);
CREATE INDEX games_due ON games(transition_at) WHERE finished_at IS NULL;
CREATE UNIQUE INDEX games_room_active ON games(code) WHERE finished_at IS NULL;

CREATE TABLE rounds (
  game_id TEXT NOT NULL REFERENCES games(id),
  number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  revealed_at INTEGER,
  result TEXT CHECK (result IN ('different', 'timeout', 'candidate', 'matched')),
  CHECK ((revealed_at IS NULL) = (result IS NULL)),
  PRIMARY KEY (game_id, number)
);
CREATE TABLE submissions (
  game_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK (seat IN (0, 1)),
  word TEXT NOT NULL,
  normalized TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, number, seat),
  FOREIGN KEY (game_id, number) REFERENCES rounds(game_id, number)
);
CREATE TABLE match_reviews (
  game_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK (seat IN (0, 1)),
  accept INTEGER NOT NULL CHECK (accept IN (0, 1)),
  PRIMARY KEY (game_id, number, seat),
  FOREIGN KEY (game_id, number) REFERENCES rounds(game_id, number)
);
CREATE TABLE rematches (
  game_id TEXT NOT NULL REFERENCES games(id),
  seat INTEGER NOT NULL CHECK (seat IN (0, 1)),
  PRIMARY KEY (game_id, seat)
);
