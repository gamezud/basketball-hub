// services/ticketService.js
const pool = require('../db');

async function createOrderWithSeats(eventId, userRef, seatIds = []) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error('No seats selected');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) ตรวจว่า event มีจริง และ (ถ้าต้องการ) อยู่ในช่วงเวลาขาย
    const { rows: ev } = await client.query(
      `SELECT id, sales_open_at, sales_close_at
         FROM event WHERE id=$1 FOR UPDATE`,
      [Number(eventId)]
    );
    if (!ev[0]) throw new Error('Event not found');

    // ถ้าอยากบังคับช่วงเวลา เปิดคอมเมนต์ 3 บรรทัดด้านล่าง
    // const now = new Date();
    // if (ev[0].sales_open_at && now < ev[0].sales_open_at) throw new Error('Sales not started');
    // if (ev[0].sales_close_at && now > ev[0].sales_close_at) throw new Error('Sales closed');

    // 2) ล็อกที่นั่งทั้งหมดของ event นั้น (แบบ all-or-nothing ด้วย NOWAIT จะเด้งเร็วถ้ามีคนจองชน)
    const ids = seatIds.map(Number);
    const { rows: seats } = await client.query(
      `SELECT * FROM seats
        WHERE id = ANY($1::int[])
          AND event_id = $2
        FOR UPDATE NOWAIT`,
      [ids, Number(eventId)]
    );

    if (seats.length !== ids.length) {
      throw new Error('Seats not found for this event');
    }
    if (seats.some(s => s.status !== 'available')) {
      throw new Error('Some seats already sold');
    }

    // 3) สร้างออเดอร์ + รายการที่นั่ง
    const total = seats.reduce((sum, s) => sum + Number(s.price), 0);
    const { rows: ord } = await client.query(
      `INSERT INTO orders(user_ref, event_id, total, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [String(userRef), Number(eventId), total]
    );

    // แทรก items และอัปเดตสถานะเก้าอี้
    const orderId = ord[0].id;
    for (const s of seats) {
      await client.query(
        `INSERT INTO order_items(order_id, seat_id, price)
         VALUES ($1, $2, $3)`,
        [orderId, s.id, s.price]
      );
      await client.query(
        `UPDATE seats SET status = 'sold' WHERE id = $1`,
        [s.id]
      );
    }

    await client.query('COMMIT');
    return ord[0]; // { id, user_ref, event_id, total, ... }
  } catch (e) {
    await client.query('ROLLBACK');
    // ถ้าเป็น error จาก NOWAIT (ที่นั่งโดนล็อกโดยทรานแซกชันอื่น)
    if (String(e.message).includes('could not obtain lock')) {
      throw new Error('Seats are being purchased by someone else. Please try again.');
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { createOrderWithSeats };
