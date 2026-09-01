const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const username = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || 'user';

if (!username || !password) {
  console.log('Usage: node scripts/add-user.js <username> <password> [role]');
  process.exit(1);
}

(async () => {
  const file = path.join(__dirname, '..', 'auth', 'users.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { users: [] };

  const passwordHash = await bcrypt.hash(password, 10);
  data.users.push({ username, passwordHash, roles: [role], groups: [] });

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`✅ Added user "${username}" as ${role}`);
})();
// node scripts/adduser.js bob Bob#5678 user