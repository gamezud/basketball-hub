-- Seats template
WITH params AS (
  SELECT 10::int AS a_count, 800::numeric AS a_price,
         10::int AS b_count, 500::numeric AS b_price
),
ev AS (
  SELECT id FROM event
)
INSERT INTO seats(event_id, section, row_label, seat_number, price)
-- A section
SELECT e.id, 'A', 'A', gs, p.a_price
FROM ev e, params p, generate_series(1, (SELECT a_count FROM params)) gs
UNION ALL
-- B section
SELECT e.id, 'B', 'B', gs, p.b_price
FROM ev e, params p, generate_series(1, (SELECT b_count FROM params)) gs
ON CONFLICT (event_id, section, row_label, seat_number)
DO NOTHING;

-- ทำให้เก้าอี้กลับเป็น available (เผื่อมีตัวไหน status ยังไม่ถูกเซ็ต)
UPDATE seats s
SET status = 'available'
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'canceled' AND s.id = oi.seat_id;

-- ลบรายการ order_items ของออเดอร์ที่ถูกยกเลิกทั้งหมด
DELETE FROM order_items oi
USING orders o
WHERE oi.order_id = o.id AND o.status = 'canceled';

-- seat ว่าง ต้องไม่มีใครถืออยู่ใน order_items
SELECT s.id FROM seats s
LEFT JOIN order_items oi ON oi.seat_id = s.id
WHERE s.status='available' AND oi.seat_id IS NOT NULL;