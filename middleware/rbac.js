// middleware/rbac.js

/**
 * hasRole('admin') - ตรวจว่าผู้ใช้มี role ที่กำหนด
 * - ถ้าไม่มี → 403
 */
function hasRole(role) {
  return (req, res, next) => {
    const roles = (req.user && req.user.roles) || [];
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden (role required)' });
    }
    next();
  };
}

module.exports = { hasRole };
