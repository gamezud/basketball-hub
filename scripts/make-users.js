// scripts/make-users.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const users = [
  { username: 'admin', password: 'Admin#1234', roles: ['admin'], groups: ['ticketing'] },
  { username: 'alice', password: 'User#1234', roles: ['user'],  groups: [] }
];

(async () => {
  const out = { users: [] };
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10); // salt rounds = 10
    out.users.push({
      username: u.username,
      passwordHash,
      roles: u.roles,
      groups: u.groups
    });
  }
  const file = path.join(__dirname, '..', 'auth', 'users.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('Wrote', file);
})();
