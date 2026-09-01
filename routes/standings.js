// routes/standings.js
const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { hasRole } = require('../middleware/rbac');
const router = express.Router();

/* ====== ฟังก์ชันคำนวณ standings ใหม่ ====== */
async function recomputeStandings() {
  await pool.query(`
    WITH finished AS (
      SELECT id, home_team_id, away_team_id, home_score, away_score
      FROM matches
      WHERE status='finished'
    ),
    home_rows AS (
      SELECT home_team_id AS team_id,
             1             AS gp,
             (home_score > away_score)::int AS wins,
             (home_score < away_score)::int AS losses,
             home_score AS pf,
             away_score AS pa
      FROM finished
    ),
    away_rows AS (
      SELECT away_team_id AS team_id,
             1             AS gp,
             (away_score > home_score)::int AS wins,
             (away_score < home_score)::int AS losses,
             away_score AS pf,
             home_score AS pa
      FROM finished
    ),
    all_rows AS (
      SELECT * FROM home_rows
      UNION ALL
      SELECT * FROM away_rows
    ),
    agg AS (
      SELECT team_id,
             COUNT(*)                AS games_played,
             SUM(wins)               AS wins,
             SUM(losses)             AS losses,
             SUM(pf)                 AS points_for,
             SUM(pa)                 AS points_against
      FROM all_rows
      GROUP BY team_id
    )
    INSERT INTO standings (team_id, games_played, wins, losses, points_for, points_against, win_pct)
    SELECT
      t.id,
      COALESCE(a.games_played, 0),
      COALESCE(a.wins, 0),
      COALESCE(a.losses, 0),
      COALESCE(a.points_for, 0),
      COALESCE(a.points_against, 0),
      CASE WHEN COALESCE(a.games_played,0) > 0
           THEN ROUND((a.wins::numeric)/a.games_played, 3)
           ELSE 0 END
    FROM teams t
    LEFT JOIN agg a ON a.team_id = t.id
    ON CONFLICT (team_id) DO UPDATE
    SET games_played   = EXCLUDED.games_played,
        wins           = EXCLUDED.wins,
        losses         = EXCLUDED.losses,
        points_for     = EXCLUDED.points_for,
        points_against = EXCLUDED.points_against,
        win_pct        = EXCLUDED.win_pct
  `);
}

/* ====== API ====== */

// GET /api/standings
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, t.name
    FROM standings s
    JOIN teams t ON t.id = s.team_id
    ORDER BY
      s.wins DESC,
      (s.points_for - s.points_against) DESC,
      s.points_for DESC,
      t.name
  `);
  res.json(rows);
});

// POST /api/standings/recompute (เรียกเองได้เวลาอยากบังคับ refresh)
router.post('/recompute', requireAuth, hasRole('admin'), async (_req, res, next) => {
  try {
    await recomputeStandings();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ====== exports ====== */
module.exports = router;                       // <- ส่งออกเป็น router ฟังก์ชัน
module.exports.recomputeStandings = recomputeStandings;  // แนบฟังก์ชันเป็นพร็อพ