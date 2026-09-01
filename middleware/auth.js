// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * requireAuth - ตรวจ Authorization: Bearer <token>
 * - ถ้าถูกต้อง → ใส่ payload ที่ req.user แล้วไปต่อ
 * - ถ้าไม่มี/ไม่ถูกต้อง → 401
 */
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // คาดว่า payload มี { sub, roles, groups }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth };
