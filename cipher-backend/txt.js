 // DOM Elements
    const roomListEl = document.getElementById('roomList');
    const memberListEl = document.getElementById('memberList');
    const messagesEl = document.getElementById('messages');
    const chatHeaderEl = document.getElementById('chatHeader');
    const msgInputEl = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');

    // State
    let rooms = {};
    let currentRoom = null;

    // Fetch and build room list from backend
    async function loadRoomsFromBackend() {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();

        data.forEach(room => {
          rooms[room.id] = {
            id: room.id,
            name: room.name,
            topic: room.topic,
            messages: [],
            unread: 0
          };
        });

        // Set first room as current
        const firstRoomId = Object.keys(rooms)[0];
        if (firstRoomId) {
          currentRoom = firstRoomId;
          initUI();
          connectWebSocket();
        }
      } catch (err) {
        console.error('❌ Failed to load rooms:', err);
      }
    }


    // Fetch users + online + currentRoom from backend
    async function fetchUsers() {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();

        renderMembers(data.users);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    }

    // Render members with online/offline styles and room tags
    function renderMembers(users) {
      memberListEl.innerHTML = ''; // clear existing

      users.forEach(({ username, online, currentRoom }) => {
        const li = document.createElement('li');
        li.classList.add('member-list-item');
        li.classList.add(online ? 'online' : 'offline');

        // Status dot
        const dot = document.createElement('div');
        dot.classList.add('member-status-dot');
        li.appendChild(dot);

        // Username text
        const nameSpan = document.createElement('span');
        nameSpan.textContent = username;
        li.appendChild(nameSpan);

        // Current room tag if present
        if (currentRoom) {
          const roomTag = document.createElement('span');
          roomTag.classList.add('member-room-tag');
          roomTag.textContent = `#${currentRoom}`;
          li.appendChild(roomTag);
        }

        memberListEl.appendChild(li);
      });
    }

    // Initial fetch and refresh every 10 seconds
    fetchUsers();
    setInterval(fetchUsers, 10000);
    
    function currentUser() {
      const meta = document.querySelector('meta[name="current-user"]');
      return meta ? meta.content.trim() : '';
    }


    // WebSocket setup
    let ws;

    function connectWebSocket() {
      ws = new WebSocket('ws://' + location.host);

      ws.addEventListener('open', () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({ type: 'auth' }));
        joinRoom(currentRoom);
      });

      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'room:userJoined' && data.room === currentRoom) {
          console.log(`${data.user} joined room ${data.room}`);
          fetchUsers(); // Refresh members list or update incrementally
        }

        if (data.type === 'room:userLeft' && data.room === currentRoom) {
          console.log(`${data.user} left room ${data.room}`);
          fetchUsers(); // Refresh members list or update incrementally
        }

        // New chat message
        if (data.type === 'chat:room' && data.room) {
          const { room, user, message } = data;

          if (!rooms[room]) {
            rooms[room] = {
              id: room,
              name: room.charAt(0).toUpperCase() + room.slice(1),
              topic: '',
              messages: [],
              unread: 0
            };
            addRoomToSidebar(room);
          }

          rooms[room].messages.push({ user, message });

          if (room === currentRoom) {
            appendMessage(user, message);
            scrollMessagesToBottom();
          } else {
            rooms[room].unread++;
            updateUnreadBadge(room);
          }
        }

        // Chat history on join
        if (data.type === 'chat:history' && data.room && Array.isArray(data.messages)) {
          if (!rooms[data.room]) return;

          // Normalize usernames just in case
          data.messages = data.messages.map(msg => ({
            user: msg.user || msg.username || 'unknown',
            message: msg.message
          }));

          rooms[data.room].messages = data.messages;

          if (data.room === currentRoom) {
            loadMessages(currentRoom);
          }
        }
      });

      ws.addEventListener('close', () => {
        console.log('WebSocket disconnected. Reconnecting in 5s...');
        setTimeout(connectWebSocket, 5000);
      });
    }

    // Append message bubble
    function appendMessage(user, message) {
      const bubble = document.createElement('div');
      bubble.classList.add('bubble');

      if (user === 'system') {
        bubble.classList.add('system');
      } else if (user === currentUser()) {
        bubble.classList.add('user');
      } else {
        bubble.classList.add('other'); // Optional: for styling other users
      }

      if (user !== 'system') {
        const nameTag = document.createElement('div');
        nameTag.classList.add('name-tag');
        nameTag.textContent = user;
        bubble.appendChild(nameTag);
      }
      console.log('[appendMessage]', { user, currentUser: currentUser() });
      console.log('[types]', typeof user, typeof currentUser());


      const msgDiv = document.createElement('div');
      msgDiv.classList.add('bubble-message');
      msgDiv.textContent = message;
      bubble.appendChild(msgDiv);

      messagesEl.appendChild(bubble);
    }


    function scrollMessagesToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function loadMessages(roomId) {
      messagesEl.innerHTML = '';
      const room = rooms[roomId];
      if (!room) return;
      room.messages.forEach(({ user, message }) => {
        appendMessage(user, message);
      });
      scrollMessagesToBottom();
    }

    function updateUnreadBadge(roomId) {
      const badge = document.getElementById(`unread-${roomId}`);
      if (!badge) return;
      const count = rooms[roomId].unread;
      badge.textContent = count > 0 ? count : '';
    }

    function joinRoom(roomId) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'join:room', room: roomId }));
      }
    }

    function addRoomToSidebar(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      const li = document.createElement('li');
      li.textContent = room.name;
      li.id = `room-${roomId}`;
      li.classList.add('room-list-item');
      if (roomId === currentRoom) li.classList.add('active');

      const badge = document.createElement('span');
      badge.classList.add('room-unread');
      badge.id = `unread-${roomId}`;
      badge.textContent = room.unread > 0 ? room.unread : '';
      li.appendChild(badge);

      li.addEventListener('click', () => {
        if (currentRoom === roomId) return;

        // Inform server we are leaving current room
        if (ws && ws.readyState === WebSocket.OPEN && currentRoom) {
          ws.send(JSON.stringify({ type: 'leave:room' }));
        }

        const oldActive = document.querySelector('.room-list li.active');
        if (oldActive) oldActive.classList.remove('active');

        li.classList.add('active');
        currentRoom = roomId;
        rooms[currentRoom].unread = 0;
        updateUnreadBadge(currentRoom);

        chatHeaderEl.innerHTML = `<span>#${room.name}</span><span class="topic">${room.topic}</span>`;

        loadMessages(currentRoom);
        joinRoom(currentRoom);
      });


      roomListEl.appendChild(li);
    }

    window.addEventListener('beforeunload', () => {
      if (ws && ws.readyState === WebSocket.OPEN && currentRoom) {
        ws.send(JSON.stringify({ type: 'leave:room' }));
      }
    });

    function currentUser() {
      return document.querySelector('meta[name="current-user"]').content;
    }

    function sendMessage() {
      const msg = msgInputEl.value.trim();
      if (!msg) return;

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'chat:room',
          room: currentRoom,
          message: msg
        }));
      }

      // Do not add locally; server will echo it back
      msgInputEl.value = '';
      msgInputEl.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    msgInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function initUI() {
      roomListEl.innerHTML = '';
      for (const roomId in rooms) {
        addRoomToSidebar(roomId);
      }

      chatHeaderEl.innerHTML = `<span>#${rooms[currentRoom].name}</span><span class="topic">${rooms[currentRoom].topic}</span>`;
      loadMessages(currentRoom);
    }

    loadRoomsFromBackend();