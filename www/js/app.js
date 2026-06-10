let peer = null;
let connections = [];
let myPeerId = null;
let roomCode = '';
let isHost = false;
let messages = [];
let username = '';

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateUsername() {
  const adjectives = ['ghost', 'shadow', 'phantom', 'void', 'null', 'dark', 'cyber', 'neon', 'matrix', 'zero'];
  const nouns = ['walker', 'hacker', 'drift', 'echo', 'flux', 'shift', 'pulse', 'raven', 'viper', 'phantom'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return adj + noun + num;
}

function createRoom() {
  roomCode = generateCode();
  isHost = true;
  username = generateUsername();
  connectPeer(roomCode, true);
}

function joinRoom() {
  const input = document.getElementById('room-input');
  const code = input.value.trim().toUpperCase();
  if (code.length < 3) {
    showToast('enter a valid room code');
    return;
  }
  roomCode = code;
  isHost = false;
  username = generateUsername();
  input.value = '';
  connectPeer(roomCode, false);
}

function connectPeer(code, host) {
  showStatus('connecting to ghost network...');

  const peerId = host ? 'ghost-' + code : undefined;

  peer = new Peer(peerId, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    },
    debug: 0
  });

  peer.on('open', function(id) {
    myPeerId = id;
    console.log('peer id:', id);

    if (host) {
      document.getElementById('room-display').classList.remove('hidden');
      document.getElementById('room-code').textContent = code;
      document.getElementById('room-input').value = code;
      showStatus('');
      enterChat();
    } else {
      const conn = peer.connect('ghost-' + code, {
        reliable: true
      });
      setupConnection(conn, false);
      showStatus('');
      enterChat();
    }
  });

  peer.on('connection', function(conn) {
    if (isHost) {
      setupConnection(conn, true);
    }
  });

  peer.on('disconnected', function() {
    showToast('connection lost. reconnecting...');
    peer.reconnect();
  });

  peer.on('error', function(err) {
    console.error('peer error:', err);
    if (err.type === 'peer-unavailable') {
      showToast('room not found. check the code and try again.');
      leaveRoom();
    } else {
      showToast('connection error: ' + err.type);
    }
  });
}

function setupConnection(conn, incoming) {
  connections.push(conn);

  conn.on('open', function() {
    console.log('connection opened with:', conn.peer);

    if (!isHost && incoming) {
      return;
    }

    conn.send({
      type: 'user-join',
      username: username,
      peerId: myPeerId,
      timestamp: Date.now()
    });

    addSystemMessage(username + ' joined the room');
    updatePeerCount();
  });

  conn.on('data', function(data) {
    handleData(data, conn);
  });

  conn.on('close', function() {
    connections = connections.filter(c => c !== conn);
    addSystemMessage('a peer disconnected');
    updatePeerCount();
  });
}

function handleData(data, conn) {
  switch (data.type) {
    case 'message':
      addMessage(data.username, data.text, data.timestamp, false);
      break;

    case 'user-join':
      addSystemMessage(data.username + ' joined the room');
      if (isHost) {
        conn.send({
          type: 'welcome',
          roomCode: roomCode,
          username: username,
          peerId: myPeerId,
          userList: connections.map(c => ({
            peerId: c.peer,
            username: c.metadata ? c.metadata.username : 'unknown'
          }))
        });
        broadcastToPeers({
          type: 'peer-joined',
          username: data.username,
          peerId: data.peerId
        }, conn);
      }
      updatePeerCount();
      break;

    case 'welcome':
      isHost = false;
      addSystemMessage('connected to room: ' + data.roomCode);
      break;

    case 'peer-joined':
      addSystemMessage(data.username + ' joined the room');
      updatePeerCount();
      break;

    case 'relay':
      broadcastToPeers(data.message, conn);
      break;
  }
}

function broadcastToPeers(message, excludeConn) {
  connections.forEach(function(conn) {
    if (conn !== excludeConn && conn.open) {
      conn.send(message);
    }
  });
}

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  const msg = {
    type: 'message',
    username: username,
    text: text,
    timestamp: Date.now()
  };

  connections.forEach(function(conn) {
    if (conn.open) {
      conn.send(msg);
    }
  });

  addMessage(username, text, Date.now(), true);
}

function addMessage(sender, text, timestamp, isOwn) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message' + (isOwn ? ' own' : '');

  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  div.innerHTML = '<div class="sender">>> ' + sender + '</div>' +
    '<div class="text">' + escapeHtml(text) + '</div>' +
    '<div class="time">' + time + '</div>';

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(text) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = '*** ' + text + ' ***';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function updatePeerCount() {
  const count = connections.length;
  document.getElementById('peer-count-num').textContent = count;
}

function enterChat() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('chat').classList.remove('hidden');
  document.getElementById('room-name').textContent = roomCode;

  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });

  addSystemMessage(isHost
    ? 'room created. share the code: ' + roomCode
    : 'connecting to room: ' + roomCode);
}

function leaveRoom() {
  if (peer) {
    peer.destroy();
    peer = null;
  }
  connections = [];
  isHost = false;

  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('chat').classList.add('hidden');
  document.getElementById('messages').innerHTML = '';
  document.getElementById('room-display').classList.add('hidden');
  document.getElementById('connection-status').classList.add('hidden');

  addSystemMessage = function() {};
}

function copyRoomCode() {
  const code = document.getElementById('room-code').textContent;
  navigator.clipboard.writeText(code).then(function() {
    showToast('code copied');
  }).catch(function() {
    showToast('copy failed');
  });
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() {
    el.classList.add('hidden');
  }, 3000);
}

function showStatus(msg) {
  const el = document.getElementById('connection-status');
  if (msg) {
    el.querySelector('span:last-child').textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
