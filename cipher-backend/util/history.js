const db = require('./db');

async function loadChatHistory(roomId, limit = 50) {
  const stmt = `
    SELECT username, message, timestamp
    FROM messages
    WHERE roomId = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `;

  return new Promise((resolve, reject) => {
    db.all(stmt, [roomId, limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.reverse()); // chronological order
    });
  });
}

module.exports = { loadChatHistory };
