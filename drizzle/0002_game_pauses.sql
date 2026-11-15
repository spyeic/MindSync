CREATE TABLE game_pauses (
  game_id TEXT PRIMARY KEY NOT NULL REFERENCES games(id),
  started_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL CHECK (deadline = started_at + 60000),
  remaining_ms INTEGER NOT NULL CHECK (remaining_ms >= 0)
);
