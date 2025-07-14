const { v4: uuid } = require('uuid');
const db = require('../util/db');
const { saveChatMessage } = require('../routes/chatHistory');
const { loadChatHistory } = require('../util/history');

const connectedUsers = new Map();

function chatHandler(ws, wss, request) {
  console.log('✨ New WebSocket connection attempt');

  ws.id = uuid();

  const sessionUser = request.session?.user?.username;

  console.log(`Session user detected: ${sessionUser}`);


  if (!sessionUser) {
    console.log('❌ WebSocket connection rejected: Missing session user');
    ws.send(JSON.stringify({ type: 'auth:fail', reason: 'Missing session' }));
    ws.close(4001, 'Missing session user');
    return;
  }

  db.get('SELECT * FROM users WHERE username = ?', [sessionUser], (err, userRow) => {
    if (err) {
      console.error('❌ DB error fetching user:', err);
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'DB error' }));
      ws.close(1011, 'DB error');
      return;
    }
    if (!userRow) {
      console.log(`❌ User not found in DB: ${sessionUser}`);
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'User not found' }));
      ws.close(4003, 'User not found');
      return;
    }
    if (userRow.banned) {
      console.log(`❌ User is banned: ${sessionUser}`);
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'Banned' }));
      ws.close(4003, 'User banned');
      return;
    }
    if (!userRow.approved) {
      console.log(`❌ User not approved: ${sessionUser}`);
      ws.send(JSON.stringify({ type: 'auth:fail', reason: 'Not approved' }));
      ws.close(4003, 'User not approved');
      return;
    }

    // Authenticated
    ws.user = sessionUser;
    ws.currentRoom = null;
    connectedUsers.set(ws.user, { ws, currentRoom: null });

    console.log(`🔐 Authenticated WS connection: ${ws.user} (${ws.id})`);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        // Logging each incoming message type and user
        console.log(`⬅️ Received WS message from ${ws.user}: ${msg.type}`);


          switch (msg.type) {
            case 'auth': {
              ws.send(JSON.stringify({ type: 'auth:success' }));
              break;
            }

            case 'join:room': {
              const roomId = msg.room;

              if (ws.currentRoom === roomId) {
                ws.send(JSON.stringify({
                  type: 'chat:history',
                  room: roomId,
                  messages: await loadChatHistory(roomId)
                }));
                break;
              }

              const oldRoom = ws.currentRoom;

              ws.currentRoom = roomId;
              connectedUsers.set(ws.user, { ws, currentRoom: roomId });

              console.log(`🔁 ${ws.user} joined room: ${roomId}`);

              if (oldRoom) {
                wss.clients.forEach(client => {
                  if (
                    client.readyState === ws.OPEN &&
                    client.currentRoom === oldRoom
                  ) {
                    client.send(JSON.stringify({
                      type: 'room:userLeft',
                      user: ws.user,
                      room: oldRoom
                    }));
                  }
                });
              }

              wss.clients.forEach(client => {
                if (
                  client.readyState === ws.OPEN &&
                  client.currentRoom === roomId
                ) {
                  client.send(JSON.stringify({
                    type: 'room:userJoined',
                    user: ws.user,
                    room: roomId
                  }));
                }
              });

              try {
                const history = await loadChatHistory(roomId);
                ws.send(JSON.stringify({
                  type: 'chat:history',
                  room: roomId,
                  messages: history
                }));
              } catch (err) {
                console.error(`❌ Failed to load chat history for ${roomId}:`, err);
              }
              break;
            }

            case 'leave:room': {
              const oldRoom = ws.currentRoom;
              if (!oldRoom) break;

              ws.currentRoom = null;
              connectedUsers.set(ws.user, { ws, currentRoom: null });

              console.log(`🚪 ${ws.user} left room: ${oldRoom}`);

              wss.clients.forEach(client => {
                if (
                  client.readyState === ws.OPEN &&
                  client.currentRoom === oldRoom
                ) {
                  client.send(JSON.stringify({
                    type: 'room:userLeft',
                    user: ws.user,
                    room: oldRoom
                  }));
                }
              });
              break;
            }

            case 'chat:room': {
              if (!msg.room || !msg.message) return;

              ws.currentRoom = msg.room;
              connectedUsers.set(ws.user, { ws, currentRoom: msg.room });

              await saveChatMessage(msg.room, ws.user, msg.message);

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
              break;
            }
          }
      
      } catch (err) {
        console.error('💥 WebSocket message error:', err);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`❌ Disconnected WS: ${ws.user} (${ws.id}) Code: ${code} Reason: ${reason}`);
      const userData = connectedUsers.get(ws.user);
      if (userData) {
        const oldRoom = userData.currentRoom;
        connectedUsers.delete(ws.user);

        if (oldRoom) {
          wss.clients.forEach(client => {
            if (
              client.readyState === ws.OPEN &&
              client.currentRoom === oldRoom
            ) {
              client.send(JSON.stringify({
                type: 'room:userLeft',
                user: ws.user,
                room: oldRoom
              }));
            }
          });
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`⚠️ WebSocket error for user ${ws.user}:`, err);
    });
  });
}

module.exports = chatHandler;
module.exports.connectedUsers = connectedUsers;
