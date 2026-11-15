ALTER TABLE room_members ADD COLUMN game_id TEXT REFERENCES games(id);

UPDATE room_members
SET game_id = (
  SELECT id FROM games
  WHERE games.code = room_members.code
    AND (games.player_a = room_members.player_id OR games.player_b = room_members.player_id)
  ORDER BY sequence DESC
  LIMIT 1
);
