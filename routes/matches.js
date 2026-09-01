// routes/matches.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { hasRole } = require("../middleware/rbac");
const { recomputeStandings } = require("./standings");
const standings = require('./standings');

// รายการแมตช์ (รวมชื่อทีม)
router.get("/", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*,
           ht.name AS home_name, at.name AS away_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.tipoff_at DESC, m.id DESC
  `);
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `
    SELECT m.*,
           ht.name AS home_name,
           at.name AS away_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.id = $1
  `,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// สร้าง match (admin)
router.post("/", requireAuth, hasRole("admin"), async (req, res) => {
  try {
    const { home_team_id, away_team_id, tipoff_at, venue } = req.body;
    if (!home_team_id || !away_team_id || !tipoff_at)
      return res
        .status(400)
        .json({ error: "home_team_id, away_team_id, tipoff_at are required" });

    const { rows } = await pool.query(
      `INSERT INTO matches (home_team_id, away_team_id, tipoff_at, venue, status)
       VALUES ($1,$2,$3,$4,'scheduled') RETURNING *`,
      [Number(home_team_id), Number(away_team_id), tipoff_at, venue || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/events", requireAuth, hasRole("admin"), async (req, res) => {
  try {
    const { match_id, sales_open_at, sales_close_at } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO event(match_id, sales_open_at, sales_close_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (match_id)
       DO UPDATE SET
         sales_open_at = EXCLUDED.sales_open_at,
         sales_close_at = EXCLUDED.sales_close_at
       RETURNING *`,
      [Number(match_id), sales_open_at || null, sales_close_at || null]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error("POST /api/events error:", e);
    res.status(400).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `
    SELECT m.*,
           ht.name AS home_name, at.name AS away_name,
           ht.short_code AS home_code, at.short_code AS away_code
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.id = $1
  `,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "match not found" });
  res.json(rows[0]);
});

// อัปเดตสกอร์/สถานะ (admin)
// PUT /api/matches/:id/score
router.put("/:id/score", requireAuth, hasRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { home_score, away_score, status } = req.body;

  try {
    if (status === "canceled") {
      // อัปเดตเฉพาะสถานะ
      const { rows } = await pool.query(
        `UPDATE matches SET status=$1 WHERE id=$2 RETURNING *`,
        ["canceled", id]
      );
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      return res.json(rows[0]);
    }

    // กรณีอื่น ๆ ต้องมีสกอร์
    if (home_score == null || away_score == null) {
      return res.status(400).json({
        error: "home_score and away_score are required unless status=canceled",
      });
    }

    const { rows } = await pool.query(
      `UPDATE matches
       SET home_score=$1, away_score=$2, status=$3
       WHERE id=$4 RETURNING *`,
      [Number(home_score), Number(away_score), status || "finished", id]
    );
    await standings.recomputeStandings();
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


router.delete("/:id", requireAuth, hasRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // หา event ทั้งหมดของแมตช์นี้
    const { rows: evs } = await client.query(
      "SELECT id FROM event WHERE match_id=$1",
      [id]
    );

    // ลบของที่โยงกับแต่ละ event (ลำดับ: order_items -> orders -> seats -> event)
    for (const ev of evs) {
      await client.query(
        "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE event_id=$1)",
        [ev.id]
      );
      await client.query("DELETE FROM orders WHERE event_id=$1", [ev.id]);
      await client.query("DELETE FROM seats WHERE event_id=$1", [ev.id]);
    }
    await client.query("DELETE FROM event WHERE match_id=$1", [id]);

    // ลบ match
    const { rowCount } = await client.query("DELETE FROM matches WHERE id=$1", [
      id,
    ]);
    await client.query("COMMIT");

    if (rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put('/:id/score', async (req, res, next) => {
  const id = Number(req.params.id);
  const { home_score, away_score, status } = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE matches
       SET home_score=$1, away_score=$2, status=$3
       WHERE id=$4 RETURNING *`,
      [Number(home_score), Number(away_score), status || 'finished', id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Match not found' });

    await standings.recomputeStandings(); // <- **คำนวณใหม่**

    res.json({ ok: true, match: rows[0] });
  } catch (err) {
    console.error('PUT /api/matches/:id/score error:', err);
    next(err);
  }
});

module.exports = router;
