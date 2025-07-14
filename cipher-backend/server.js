// File: server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MemoryStore = require('express-session').MemoryStore;
const cookie = require('cookie');
const signature = require('cookie-signature');
const bcrypt = require('bcryptjs');

const apiRoutes = require('./routes/api');
const chatHandler = require('./sockets/chat');
const db = require('./util/db');

// --- Express Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const sessionStoreInstance = new MemoryStore();

// --- Session Middleware ---
const sessionMiddleware = session({
  secret: 'cipher-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStoreInstance,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
});

// --- Middleware ---
app.use(cors({
  origin: 'http://localhost:5000',
  credentials: true,
}));
app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many requests. Please try again shortly.',
});
app.use('/api/login', limiter);
app.use('/api/signup', limiter);

// --- API Routes ---
app.use('/api', apiRoutes);

// --- WebSocket Auth (Manual Upgrade) ---
server.on('upgrade', (request, socket, head) => {
  const cookies = cookie.parse(request.headers.cookie || '');
  const raw = cookies['connect.sid'];

  if (!raw) return socket.destroy();

  const sid = signature.unsign(raw.slice(2), 'cipher-secret-key');
  if (!sid) return socket.destroy();

  sessionStoreInstance.get(sid, (err, session) => {
    if (err || !session) return socket.destroy();

    request.session = session;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

// --- WebSocket Connection ---
wss.on('connection', (ws, request) => {
  if (!request.session || !request.session.user) {
    ws.send(JSON.stringify({ type: 'auth:fail', reason: 'No session' }));
    return ws.close();
  }

  console.log(`⚡ Client connected: ${request.session.user}`);
  chatHandler(ws, wss, request);
});

// --- SQLite Init ---
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT,
      ip TEXT,
      approved INTEGER,
      banned INTEGER,
      requestedAt TEXT,
      isAdmin INTEGER,
      online INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId TEXT,
      username TEXT,
      message TEXT,
      timestamp TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      topic TEXT
    )
  `);

  // Insert default room
  db.get('SELECT COUNT(*) AS count FROM rooms', (err, row) => {
    if (!row || row.count === 0) {
      db.run('INSERT INTO rooms (id, name, topic) VALUES (?, ?, ?)', ['general', 'General Chat', 'Welcome to Cipher!']);
    }
  });

  // Create default admin if not exists
  db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, row) => {
    if (!row) {
      const hash = await bcrypt.hash('adminpassword', 10);
      db.run(
        `INSERT INTO users (username, password, ip, approved, banned, requestedAt, isAdmin, online)
         VALUES (?, ?, ?, 1, 0, ?, 1, 0)`,
        ['admin', hash, '127.0.0.1', new Date().toISOString()],
        () => console.log('✅ Default admin account created.')
      );
    }
  });
});

// --- Start ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Cipher server running on http://localhost:${PORT}`);
});