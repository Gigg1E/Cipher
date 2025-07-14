// routes/api.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../util/db');
const chatHandler = require('../sockets/chat'); // adjust path as needed
const connectedUsers = chatHandler.connectedUsers;
const { saveChatMessage, loadChatHistory } = require('./chatHistory');

const router = express.Router();

// --- Middleware ---

// Require login middleware
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// Require admin middleware
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}


// --- Routes ---

// Signup with manual approval and IP limit
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) return res.status(400).json({ error: 'User already exists' });

    db.get('SELECT COUNT(*) AS count FROM users WHERE ip = ?', [ip], async (err, countRow) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (countRow.count >= 2) return res.status(429).json({ error: 'Max accounts per IP reached' });

      bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: 'Hashing failed' });
        const now = new Date().toISOString();

        db.run(
          `INSERT INTO users (username, password, ip, approved, banned, requestedAt, isAdmin, online)
           VALUES (?, ?, ?, 0, 0, ?, 0, 0)`,
          [username, hash, ip, now],
          (err) => {
            if (err) return res.status(500).json({ error: 'Failed to create user' });

            console.log(`📝 New signup request: ${username}`);
            res.json({ success: true, message: 'Signup request sent. Await admin approval.' });
          }
        );
      });
    });
  });
});

// Login route
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.banned) return res.status(403).json({ error: 'User is banned' });
    if (!user.approved) return res.status(403).json({ error: 'Awaiting admin approval' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    // Store an object, not string
    req.session.user = {
      username: user.username,
      isAdmin: !!user.isAdmin, // store boolean
    };

    // Mark online
    db.run('UPDATE users SET online = 1 WHERE username = ?', [username]);

    res.json({ success: true, user: user.username, isAdmin: !!user.isAdmin });
  });
});


// Logout route
router.post('/logout', requireLogin, (req, res) => {
  const user = req.session.user;
  req.session.destroy(() => {
    db.run('UPDATE users SET online = 0 WHERE username = ?', [user]);
    res.json({ success: true });
  });
});

// Session info
router.get('/session', (req, res) => {
  if (!req.session.user) return res.json({ loggedIn: false });

  db.get('SELECT * FROM users WHERE username = ?', [req.session.user.username], (err, user) => {
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

// Get rooms list
router.get('/rooms', (req, res) => {
  db.all('SELECT id, name, topic FROM rooms', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to get rooms' });
    res.json(rows);
  });
});

// Get members list (online & approved)
router.get('/members', (req, res) => {
  db.all(
    'SELECT username, online FROM users WHERE approved = 1 AND banned = 0',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to get members' });

      const members = rows.map(u => ({
        username: u.username,
        online: !!u.online,
        room: null // room tracking can be implemented here later
      }));

      res.json(members);
    }
  );
});

// New endpoint: Get all users with online and current room info
router.get('/users', (req, res) => {
  db.all('SELECT username, online FROM users WHERE approved = 1 AND banned = 0', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    const users = rows.map(user => {
      const connection = connectedUsers.get(user.username);
      return {
        username: user.username,
        online: !!user.online,
        currentRoom: connection ? connection.currentRoom : null
      };
    });

    res.json({ users });
  });
});

// Get chat history (paginated)
router.get('/room/:roomId/history', async (req, res) => {
  const roomId = req.params.roomId;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const messages = await loadChatHistory(roomId, limit, offset);
    res.json({ messages, offset, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

// --- Admin routes ---

// Get pending users (awaiting approval)
router.get('/admin/pending', requireAdmin, (req, res) => {
  db.all(
    'SELECT username, ip, requestedAt FROM users WHERE approved = 0 AND banned = 0',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ pending: rows });
    }
  );
});

// Get all users (admin view)
router.get('/admin/users', requireAdmin, (req, res) => {
  db.all(
    'SELECT username, ip, approved, banned, isAdmin, requestedAt, online FROM users',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ users: rows });
    }
  );
});

// Approve or ban user (admin action)
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

// Delete user (admin only)
router.post('/admin/delete', requireAdmin, async (req, res) => {
  const { target, adminPassword } = req.body;
  const adminUsername = req.session.user.username; // ✅ FIXED

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


// Room creation route (admin only)
router.post('/admin/rooms/create', requireAdmin, async (req, res) => {
  const session = req.session;
  const { id, name, topic } = req.body;

  if (!session || !session.user || !session.user.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (!id || !name || !topic) {
    return res.status(400).json({ error: 'Missing room data' });
  }

  db.get('SELECT id FROM rooms WHERE id = ?', [id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (existing) return res.status(400).json({ error: 'Room ID already exists' });

    db.run(
      'INSERT INTO rooms (id, name, topic) VALUES (?, ?, ?)',
      [id, name, topic],
      (err) => {
        if (err) return res.status(500).json({ error: 'Failed to insert room' });
        return res.json({ success: true });
      }
    );
  });
});

// Room delete route (adnin only)
router.post('/admin/rooms/delete', requireAdmin, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing room ID' });

  try {
    const stmt = db.prepare('DELETE FROM rooms WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    db.prepare('DELETE FROM messages WHERE roomId = ?').run(id);

    return res.json({ success: true });
  } catch (err) {
    console.error('[Room Delete Error]', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});



module.exports = router;
