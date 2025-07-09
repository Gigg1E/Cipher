// File: sockets/chat.js
const { v4: uuid } = require('uuid');
const db = require('../util/db');
const { saveChatMessage } = require('../routes/chatHistory');

function chatHandler(ws, wss, request) {
  ws.id = uuid();
  const sessionUser = request.session.user;

  if (!sessionUser) {
    ws.send(JSON.stringify({ type: 'auth:fail', reason: 'Missing session' }));
    ws.close();
    return;
  }

  // Validate user from database
  db.get('SELECT * FROM users WHERE username = ?', [sessionUser], (err, userRow) => {
    if (err || !userRow) {
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'User not found' }));
      ws.close();
      return;
    }

    if (userRow.banned || !userRow.approved) {
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'Not authorized' }));
      ws.close();
      return;
    }

    // Valid session
    ws.user = sessionUser;
    ws.currentRoom = null;

    console.log(`🔐 Authenticated WS connection: ${ws.user} (${ws.id})`);

    // Handle incoming WebSocket messages
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);

        switch (msg.type) {
          case 'auth': {
            ws.send(JSON.stringify({ type: 'auth:success' }));
            break;
          }

          case 'join:room': {
            if (!msg.room) return;
            ws.currentRoom = msg.room;
            console.log(`📥 ${ws.user} joined room "${msg.room}"`);
            break;
          }

          case 'chat:room': {
            if (!msg.room || !msg.message) return;

            ws.currentRoom = msg.room;
            saveChatMessage(msg.room, ws.user, msg.message);

            wss.clients.forEach(client => {
              if (
                client.readyState === ws.OPEN &&
                client.currentRoom === msg.room
              ) {
                client.send(JSON.stringify({
                  type: 'chat:room',
                  room: msg.room,
                  user: ws.user,
                  message: msg.message
                }));
              }
            });
            break;
          }

          case 'chat:channel': {
            if (!msg.message) return;

            wss.clients.forEach(client => {
              if (client.readyState === ws.OPEN) {
                client.send(JSON.stringify({
                  type: 'chat:channel',
                  user: ws.user,
                  message: msg.message
                }));
              }
            });
            break;
          }

          case 'chat:dm:relay': {
            if (!msg.to || !msg.message) return;

            wss.clients.forEach(client => {
              if (client.user === msg.to && client.readyState === ws.OPEN) {
                client.send(JSON.stringify({
                  type: 'chat:dm:relay',
                  from: ws.user,
                  message: msg.message
                }));
              }
            });
            break;
          }

          default: {
            console.warn(`⚠️ Unknown message type: ${msg.type}`);
          }
        }
      } catch (err) {
        console.error('💥 WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      console.log(`❌ Disconnected: ${ws.user} (${ws.id})`);
    });
  });
}

module.exports = chatHandler;
