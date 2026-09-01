// Public/js/Events.js
// === Admin: list orders of an event (with items) ===
router.get('/events/:eventId/orders', requireAuth, hasRole('admin'), async (req, res) => {
  const { rows: orders } = await pool.query(
    `SELECT * FROM orders WHERE event_id=$1 ORDER BY id DESC`,
    [req.params.eventId]
  );
  const orderIds = orders.map(o => o.id);
  const { rows: items } = orderIds.length
    ? await pool.query(
        `SELECT oi.*, s.section, s.row_label, s.seat_number
         FROM order_items oi JOIN seats s ON s.id=oi.seat_id
         WHERE oi.order_id = ANY($1) ORDER BY order_id, seat_id`,
        [orderIds]
      )
    : { rows: [] };

  const grouped = orders.map(o => ({
    order: o,
    items: items.filter(i => i.order_id === o.id)
  }));
  res.json(grouped);
});

// === Admin: cancel whole order (release all seats) ===
router.post('/orders/:orderId/cancel', requireAuth, hasRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: items } = await client.query(
      `SELECT seat_id FROM order_items WHERE order_id=$1 FOR UPDATE`,
      [req.params.orderId]
    );

    const seatIds = items.map(i => i.seat_id);
    if (seatIds.length) {
      await client.query(`UPDATE seats SET status='available' WHERE id = ANY($1)`, [seatIds]);
      await client.query(`DELETE FROM order_items WHERE order_id=$1`, [req.params.orderId]);
    }
    await client.query(`UPDATE orders SET status='canceled', total=0 WHERE id=$1`, [req.params.orderId]);

    await client.query('COMMIT');
    res.json({ ok: true, released: seatIds.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// === Admin: release a single seat from an order ===
router.post('/orders/:orderId/release-seat', requireAuth, hasRole('admin'), async (req, res) => {
  const { seat_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM order_items WHERE order_id=$1 AND seat_id=$2`, [req.params.orderId, seat_id]);
    await client.query(`UPDATE seats SET status='available' WHERE id=$1`, [seat_id]);
    await client.query(
      `UPDATE orders o
       SET total = COALESCE((SELECT SUM(price) FROM order_items WHERE order_id=o.id), 0)
       WHERE id=$1`, [req.params.orderId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});
