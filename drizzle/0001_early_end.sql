ALTER TABLE games ADD COLUMN ended_early INTEGER NOT NULL DEFAULT 0
  CONSTRAINT games_early_end CHECK (ended_early = 0 OR (ended_early = 1 AND phase = 'FINISHED' AND matched = 0));

CREATE INDEX games_room_history ON games(code, finished_at, sequence);
