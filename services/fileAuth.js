const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const FILE = path.join(__dirname, '..', 'auth', 'users.json');

function readUsers() {
  const raw = fs.readFileSync(FILE, 'utf-8');
  return JSON.parse(raw).users || [];
}

async function verifyUser(username, password) {
  const u = readUsers().find(x => x.username === username);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;
  return { username: u.username, roles: u.roles || [], groups: u.groups || [] };
}

module.exports = { verifyUser };
