// util/sessionStore.js (or routes/api.js)
const express = require('express');
const router = express.Router();
const db = require('../util/db'); 
const bcrypt = require('bcryptjs');

// Middleware to require admin access
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  db.get('SELECT isAdmin FROM users WHERE username = ?', [req.session.user], (err, row) => {
    if (err || !row || !row.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Signup route (manual approval workflow)
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT username FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) return res.status(400).json({ error: 'User already exists' });

    db.get('SELECT COUNT(*) AS count FROM users WHERE ip = ?', [ip], async (err, countRow) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (countRow.count >= 2) return res.status(429).json({ error: 'Max accounts per IP reached' });

      const hash = await bcrypt.hash(password, 10);
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO users (username, password, ip, approved, banned, requestedAt, isAdmin, online) 
         VALUES (?, ?, ?, 0, 0, ?, 0, 0)`,
        [username, hash, ip, now],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to create user' });

          console.log(`📝 New signup request: ${username}`);
          res.json({ success: true, message: 'Signup request sent. Await admin approval.' });
        }
      );
    });
  });
});

// Login route
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'User is banned' });
    if (!user.approved) return res.status(403).json({ error: 'Awaiting admin approval' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    req.session.user = username;

    // Mark online
    db.run('UPDATE users SET online = 1 WHERE username = ?', [username]);

    res.json({ success: true, user: username, isAdmin: !!user.isAdmin });
  });
});

// Session info route
router.get('/session', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });

  db.get('SELECT * FROM users WHERE username = ?', [req.session.user], (err, user) => {
    if (err || !user || user.banned || !user.approved) {
      return res.json({ loggedIn: false });
    }
    res.json({
      loggedIn: true,
      user: user.username,
      isAdmin: !!user.isAdmin
    });
  });
});

// Admin: Approve or ban user
router.post('/admin/approve', requireAdmin, (req, res) => {
  const { username, approve, ban } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const approvedVal = typeof approve === 'boolean' ? (approve ? 1 : 0) : user.approved;
    const bannedVal = typeof ban === 'boolean' ? (ban ? 1 : 0) : user.banned;

    db.run('UPDATE users SET approved = ?, banned = ? WHERE username = ?', [approvedVal, bannedVal, username], (err) => {
      if (err) return res.status(500).json({ error: 'Update failed' });
      res.json({ success: true });
    });
  });
});

// Admin: List pending users
router.get('/admin/pending', requireAdmin, (req, res) => {
  db.all('SELECT username, ip, requestedAt FROM users WHERE approved = 0 AND banned = 0', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ pending: rows });
  });
});

// Admin: List all users
router.get('/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT username, ip, approved, banned, isAdmin, requestedAt, online FROM users', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ users: rows });
  });
});

// Admin: Delete user (requires admin password)
router.post('/admin/delete', requireAdmin, async (req, res) => {
  const { target, adminPassword } = req.body;
  const adminUsername = req.session.user;

  db.get('SELECT * FROM users WHERE username = ?', [adminUsername], async (err, admin) => {
    if (err || !admin) return res.status(403).json({ error: 'Admin required' });
    if (!admin.isAdmin) return res.status(403).json({ error: 'Admin required' });

    const valid = await bcrypt.compare(adminPassword, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid admin password' });

    db.get('SELECT username FROM users WHERE username = ?', [target], (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });

      db.run('DELETE FROM users WHERE username = ?', [target], err => {
        if (err) return res.status(500).json({ error: 'Failed to delete user' });
        res.json({ success: true });
      });
    });
  });
});

module.exports = router;
