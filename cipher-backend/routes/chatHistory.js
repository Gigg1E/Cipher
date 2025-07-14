// routes/chatHistory.js
const db = require('../util/db');
const dayjs = require('dayjs');

// Save a new chat message into SQLite
function saveChatMessage(roomId, user, message) {
  const timestamp = new Date().toISOString();
  db.run(
    `INSERT INTO messages (roomId, username, message, timestamp)
     VALUES (?, ?, ?, ?)`,
    [roomId, user, message, timestamp],
    (err) => {
      if (err) {
        console.error('💥 Failed to save chat message:', err);
      } else {
        console.log(`💬 [${roomId}] ${user}: ${message}`);
      }
    }
  );
}

// Load paginated chat history for a room
function loadChatHistory(roomId, limit = 20, offset = 0) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT username AS user, message, timestamp
       FROM messages
       WHERE roomId = ?
       ORDER BY timestamp ASC
       LIMIT ? OFFSET ?`,
      [roomId, limit, offset],
      (err, rows) => {
        if (err) {
          console.error('💥 Failed to load chat history:', err);
          return reject(err);
        }

        // Optionally format timestamp
        const formatted = rows.map(row => ({
          ...row,
          time: dayjs(row.timestamp).format('HH:mm')
        }));

        resolve(formatted);
      }
    );
  });
}

module.exports = {
  saveChatMessage,
  loadChatHistory
};
