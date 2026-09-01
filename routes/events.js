const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { hasRole } = require("../middleware/rbac");
const { createOrderWithSeats } = require("../services/ticketService");
const router = express.Router();

/* ========== EVENTS ========== */

// สร้าง/อัปเดต Event ให้ match_id
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

// หา Event ด้วย match_id (1:1 หรือ 1:0)
router.get("/events/:matchId", async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM event WHERE match_id=$1`, [
    Number(req.params.matchId),
  ]);
  res.json(rows[0] || null);
});

/* ========== SEATS ========== */

router.get("/events/:eventId/seats", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM seats WHERE event_id=$1 ORDER BY section,row_label,seat_number`,
    [Number(req.params.eventId)]
  );
  res.json(rows);
});

router.post(
  "/events/:eventId/seats",
  requireAuth,
  hasRole("admin"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { seats = [] } = req.body; // [{section,row_label,seat_number,price}]
      await client.query("BEGIN");
      for (const s of seats) {
        await client.query(
          `INSERT INTO seats(event_id,section,row_label,seat_number,price)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (event_id,section,row_label,seat_number)
           DO UPDATE SET price=EXCLUDED.price`,
          [
            Number(req.params.eventId),
            s.section,
            s.row_label,
            Number(s.seat_number),
            Number(s.price),
          ]
        );
      }
      await client.query("COMMIT");
      res.status(201).json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);
router.post(
  "/events/:eventId/seed-seats",
  requireAuth,
  hasRole("admin"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const eventId = Number(req.params.eventId);
      // default ชุดมาตรฐาน
      const aCount = 10,
        aPrice = 800;
      const bCount = 10,
        bPrice = 500;

      await client.query(
        `
        INSERT INTO seats(event_id, section, row_label, seat_number, price)
        SELECT $1, 'A', 'A', gs, $2 FROM generate_series(1,$3) gs
        UNION ALL
        SELECT $1, 'B', 'B', gs, $4 FROM generate_series(1,$5) gs
        ON CONFLICT (event_id, section, row_label, seat_number) DO NOTHING
        `,
        [eventId, aPrice, aCount, bPrice, bCount]
      );

      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total FROM seats WHERE event_id=$1`,
        [eventId]
      );
      res.json({ ok: true, event_id: eventId, seats_total: rows[0].total });
    } catch (e) {
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);

/* ========== ORDERS ========== */

// ผู้ใช้ซื้อ: สร้าง order + ล็อกเก้าอี้
router.post("/events/:eventId/orders", requireAuth, async (req, res) => {
  try {
    const order = await createOrderWithSeats(
      Number(req.params.eventId),
      req.user.sub,
      (req.body.seatIds || []).map(Number)
    );
    res.status(201).json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// (Admin) โหลดออเดอร์ทั้งหมดของ event พร้อมรายการที่นั่ง
router.get(
  "/events/:eventId/orders",
  requireAuth,
  hasRole("admin"),
  async (req, res) => {
    const eventId = Number(req.params.eventId);
    const { rows: orders } = await pool.query(
      `SELECT * FROM orders WHERE event_id=$1 ORDER BY id DESC`,
      [eventId]
    );
    if (!orders.length) return res.json([]);

    const orderIds = orders.map((o) => o.id);
    const { rows: items } = await pool.query(
      `SELECT oi.*, s.section, s.row_label, s.seat_number
       FROM order_items oi
       JOIN seats s ON s.id = oi.seat_id
       WHERE oi.order_id = ANY($1::int[])`,
      [orderIds]
    );

    const byOrder = {};
    for (const o of orders) byOrder[o.id] = { order: o, items: [] };
    for (const it of items) byOrder[it.order_id]?.items.push(it);
    res.json(Object.values(byOrder));
  }
);

// (Admin) ยกเลิกออเดอร์ + ปล่อยเก้าอี้ + ลบ order_items (กัน unique ซ้ำ)
router.post(
  "/orders/:orderId/cancel",
  requireAuth,
  hasRole("admin"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const orderId = Number(req.params.orderId);
      await client.query("BEGIN");
      const { rows: seats } = await client.query(
        `SELECT seat_id FROM order_items WHERE order_id=$1`,
        [orderId]
      );
      const seatIds = seats.map((s) => s.seat_id);
      if (seatIds.length) {
        await client.query(
          `UPDATE seats SET status='available' WHERE id = ANY($1::int[])`,
          [seatIds]
        );
        await client.query(`DELETE FROM order_items WHERE order_id=$1`, [
          orderId,
        ]);
      }
      await client.query(`UPDATE orders SET status='canceled' WHERE id=$1`, [
        orderId,
      ]);
      await client.query("COMMIT");
      res.json({ ok: true, released: seatIds.length });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);

// (Admin) ปล่อยเก้าอี้เดี่ยวออกจากออเดอร์
router.post(
  "/orders/:orderId/release-seat",
  requireAuth,
  hasRole("admin"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const orderId = Number(req.params.orderId);
      const seatId = Number(req.body.seat_id);
      await client.query("BEGIN");
      await client.query(`UPDATE seats SET status='available' WHERE id=$1`, [
        seatId,
      ]);
      await client.query(
        `DELETE FROM order_items WHERE order_id=$1 AND seat_id=$2`,
        [orderId, seatId]
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);

/* ===== USER endpoints ===== */

// ดูออร์เดอร์ของฉัน (กรองตาม eventId ได้)
router.get("/my/orders", requireAuth, async (req, res) => {
  try {
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    const { rows: orders } = await pool.query(
      `SELECT * FROM orders
       WHERE user_ref=$1 ${eventId ? "AND event_id=$2" : ""}
       ORDER BY id DESC`,
      eventId ? [req.user.sub, eventId] : [req.user.sub]
    );
    if (!orders.length) return res.json([]);

    const orderIds = orders.map((o) => o.id);
    const { rows: items } = await pool.query(
      `SELECT oi.*, s.section, s.row_label, s.seat_number
       FROM order_items oi
       JOIN seats s ON s.id = oi.seat_id
       WHERE oi.order_id = ANY($1::int[])`,
      [orderIds]
    );

    const byOrder = {};
    for (const o of orders) byOrder[o.id] = { order: o, items: [] };
    for (const it of items) byOrder[it.order_id]?.items.push(it);
    res.json(Object.values(byOrder));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ผู้ใช้ยกเลิกออเดอร์ของตัวเอง (เฉพาะ pending)
router.post("/my/orders/:orderId/cancel", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = Number(req.params.orderId);
    await client.query("BEGIN");

    const { rows: od } = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND user_ref=$2`,
      [orderId, req.user.sub]
    );
    const order = od[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Only pending orders can be canceled" });
    }

    const { rows: seats } = await client.query(
      `SELECT seat_id FROM order_items WHERE order_id=$1`,
      [orderId]
    );
    const seatIds = seats.map((s) => s.seat_id);
    if (seatIds.length) {
      await client.query(
        `UPDATE seats SET status='available' WHERE id = ANY($1::int[])`,
        [seatIds]
      );
      await client.query(`DELETE FROM order_items WHERE order_id=$1`, [
        orderId,
      ]);
    }
    await client.query(`UPDATE orders SET status='canceled' WHERE id=$1`, [
      orderId,
    ]);

    await client.query("COMMIT");
    res.json({ ok: true, released: seatIds.length });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// แสดงเฉพาะตั๋วที่จ่ายเงินแล้ว (paid เท่านั้น)
router.get("/my/tickets", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        o.id AS order_id,
        o.created_at,
        o.status,
        oi.price,
        s.section, s.row_label, s.seat_number,
        m.tipoff_at, m.venue,
        ht.name AS home_name, at.name AS away_name
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN seats s        ON s.id = oi.seat_id
      JOIN event e        ON e.id = o.event_id
      JOIN matches m      ON m.id = e.match_id
      JOIN teams ht       ON ht.id = m.home_team_id
      JOIN teams at       ON at.id = m.away_team_id
      WHERE o.user_ref = $1
        AND o.status = 'paid'            -- << สำคัญ
      ORDER BY o.created_at DESC, oi.id ASC
      `,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// (User) mark as paid
router.post("/my/orders/:orderId/pay", requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { rows, rowCount } = await pool.query(
      `UPDATE orders SET status='paid'
       WHERE id=$1 AND user_ref=$2 AND status='pending'
       RETURNING *`,
      [orderId, req.user.sub]
    );
    if (!rowCount)
      return res
        .status(400)
        .json({ error: "Cannot mark as paid (not owner or not pending)." });
    res.json({ ok: true, order: rows[0] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
