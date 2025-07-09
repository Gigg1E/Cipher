// File: syncAdminUser.js
const db = require('./util/db'); // ✅ This ensures tables are created
const bcrypt = require('bcryptjs');

const adminUser = {
  username: 'admin',
  password: 'admin123', // You can hash this later or store it pre-hashed
  approved: 1,
  banned: 0,
  ip: '127.0.0.1',
  requestedAt: new Date().toISOString(),
  isAdmin: 1,
  online: 0
};

// First check if admin exists
db.get('SELECT * FROM users WHERE username = ?', [adminUser.username], async (err, row) => {
  if (err) return console.error('DB Error:', err);
  if (row) return console.log('✅ Admin already exists');

  const hashed = await bcrypt.hash(adminUser.password, 10);

  db.run(
    `INSERT INTO users (username, password, approved, banned, ip, requestedAt, isAdmin, online)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      adminUser.username,
      hashed,
      adminUser.approved,
      adminUser.banned,
      adminUser.ip,
      adminUser.requestedAt,
      adminUser.isAdmin,
      adminUser.online
    ],
    err => {
      if (err) return console.error('❌ Failed to insert admin:', err);
      console.log('✅ Admin user created');
    }
  );
});
