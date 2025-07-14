// util/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure the data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Path to SQLite database file
const dbPath = path.join(dataDir, 'cipher.sqlite');

// Open the SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Failed to connect to the SQLite database:', err);
  } else {
    console.log('✅ Connected to the SQLite database');
  }
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    ip TEXT,
    approved INTEGER DEFAULT 0,
    banned INTEGER DEFAULT 0,
    requestedAt TEXT,
    isAdmin INTEGER DEFAULT 0,
    online INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(roomId) REFERENCES rooms(id),
    FOREIGN KEY(username) REFERENCES users(username)
  )`);

  // Optional: insert default room if none exist
  db.get(`SELECT COUNT(*) as count FROM rooms`, (err, row) => {
    if (!err && row.count === 0) {
      db.run(`INSERT INTO rooms (id, name, topic) VALUES (?, ?, ?)`,
        ['general', 'General Chat', 'General discussion for everyone']);
      console.log('📌 Created default room "General Chat"');
    }
  });
});

module.exports = db;
