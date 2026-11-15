ALTER TABLE rooms RENAME COLUMN code TO id;
ALTER TABLE room_members RENAME COLUMN code TO room_id;
ALTER TABLE games RENAME COLUMN code TO room_id;

ALTER TABLE rooms ADD COLUMN public_code TEXT
  CHECK (public_code IS NULL OR public_code GLOB '[0-9][0-9][0-9][0-9]');
ALTER TABLE rooms ADD COLUMN empty_deadline INTEGER;
UPDATE rooms SET public_code = id WHERE id GLOB '[0-9][0-9][0-9][0-9]';
DELETE FROM room_members WHERE room_id IN (SELECT id FROM rooms WHERE public_code IS NULL);
DELETE FROM rooms WHERE public_code IS NULL AND NOT EXISTS (SELECT 1 FROM games WHERE room_id = rooms.id);
CREATE UNIQUE INDEX rooms_public_code ON rooms(public_code);
CREATE INDEX rooms_empty_deadline ON rooms(empty_deadline);
