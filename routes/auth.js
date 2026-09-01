const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyUser } = require('../services/fileAuth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = await verifyUser(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { sub: user.username, roles: user.roles, groups: user.groups },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token });
});

module.exports = router;
