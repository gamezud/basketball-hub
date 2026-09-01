const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { hasRole } = require('../middleware/rbac');

const router = express.Router();

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM teams ORDER BY name');
  res.json(rows);
});

router.post('/', requireAuth, hasRole('admin'), async (req, res) => {
  const { name, city, short_code } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO teams(name, city, short_code) VALUES ($1,$2,$3) RETURNING *`,
    [name, city, short_code]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/teams/:id  — ลบทีมได้ต่อเมื่อไม่มีแมตช์อ้างอิง
router.delete('/:id', requireAuth, hasRole('admin'), async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    // กันลบถ้ายังอยู่ในแมตช์
    const { rows: [c] } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM matches WHERE home_team_id=$1 OR away_team_id=$1)::int AS match_count`,
      [id]
    );
    if (c.match_count > 0) {
      return res.status(409).json({ error: 'Cannot delete: team is used in matches' });
    }

    // ถ้าคุณไม่ได้ตั้ง ON DELETE CASCADE ให้ standings:
    // await pool.query('DELETE FROM standings WHERE team_id=$1', [id]);

    await pool.query('DELETE FROM teams WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
