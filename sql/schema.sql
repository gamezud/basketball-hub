-- TEAMS / PLAYERS
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(120),
  short_code VARCHAR(10) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES teams(id),
  first_name VARCHAR(80),
  last_name VARCHAR(80),
  position VARCHAR(10),
  jersey_number INT
);

-- MATCHES
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  home_team_id INT NOT NULL REFERENCES teams(id),
  away_team_id INT NOT NULL REFERENCES teams(id),
  tipoff_at TIMESTAMP NOT NULL,
  venue VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  home_score INT DEFAULT 0,
  away_score INT DEFAULT 0,
  CONSTRAINT ck_match_teams_diff CHECK (home_team_id <> away_team_id),
  CONSTRAINT ck_match_status CHECK (status IN ('scheduled','live','finished','canceled'))
);

-- STANDINGS
CREATE TABLE IF NOT EXISTS standings (
  team_id INT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  games_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  points_for INT DEFAULT 0,
  points_against INT DEFAULT 0,
  win_pct NUMERIC(5,3) DEFAULT 0
);

-- TICKETING
CREATE TABLE IF NOT EXISTS event (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL UNIQUE REFERENCES matches(id),
  sales_open_at TIMESTAMP,
  sales_close_at TIMESTAMP,
  CONSTRAINT ck_event_sales_window
    CHECK (sales_open_at IS NULL OR sales_close_at IS NULL OR sales_open_at < sales_close_at)
);

CREATE TABLE IF NOT EXISTS seats (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  section VARCHAR(20),
  row_label VARCHAR(5),
  seat_number INT,
  price NUMERIC(10,2) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'available',
  CONSTRAINT ck_seat_status CHECK (status IN ('available','sold')),
  CONSTRAINT ck_seat_price CHECK (price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_in_event
ON seats(event_id, section, row_label, seat_number);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_ref VARCHAR(120) NOT NULL,
  event_id INT NOT NULL REFERENCES event(id),
  total NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  CONSTRAINT ck_order_status CHECK (status IN ('pending','paid','canceled'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seat_id INT NOT NULL REFERENCES seats(id),
  price NUMERIC(10,2) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_seat ON order_items(seat_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS ix_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS ix_matches_home ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS ix_matches_away ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS ix_standings_team ON standings(team_id);
CREATE INDEX IF NOT EXISTS ix_seats_event ON seats(event_id);
CREATE INDEX IF NOT EXISTS ix_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS ix_oi_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS ix_oi_seat ON order_items(seat_id);

-- ตรวจว่ามี constraint fk_matches_home_team แล้วหรือยัง
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_matches_home_team'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT fk_matches_home_team
      FOREIGN KEY (home_team_id) REFERENCES teams(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ตรวจอีกฝั่ง (away_team_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_matches_away_team'
  ) THEN
    ALTER TABLE matches
      ADD CONSTRAINT fk_matches_away_team
      FOREIGN KEY (away_team_id) REFERENCES teams(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname LIKE 'fk_matches_%';

-- ให้ standings ลบแถวตัวเองอัตโนมัติเมื่อทีมโดนลบ
ALTER TABLE standings
  DROP CONSTRAINT IF EXISTS standings_team_id_fkey;

ALTER TABLE standings
  ADD CONSTRAINT standings_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id)
  ON DELETE CASCADE;
