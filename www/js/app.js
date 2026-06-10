/* ═════════════════════════════════════════════════════════
   GHOST CHAT v4.0 — Full P2P Messenger
   Contacts · Room History · Navigation · All Features
   ═════════════════════════════════════════════════════════ */

let peer, connections = [], myPeerId, roomCode = '', isHost = false, username = '';
let qrCodeInstance, html5QrCode, bleDevice;
let typingTimeout, messageHistory = [];
let soundEnabled = true, vibrateEnabled = true;
let replyTo = null, destructTimer = 0, editMsgId = null;
let roomLocked = false, roomPassword = '', roomName = '', roomDisplayName = '';
let unreadCount = 0, isFocused = true;
let mediaRecorder, audioChunks = [], voiceStream;
let peerUserMap = {}, offlineQueue = [];
let isOnline = navigator.onLine;
let currentRoomCode = '';

window.addEventListener('focus', () => isFocused = true);
window.addEventListener('blur', () => { isFocused = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) screenshotDetect();
  else { isFocused = true; updateTotalUnread(); }
});

/* ═══════════════════ UTILITIES ═══════════════════ */

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.random() * c.length | 0];
  return r;
}

function genName() {
  const a = ['Ghost','Shadow','Phantom','Void','Null','Dark','Cyber','Neon','Matrix','Echo','Flux','Cipher'];
  const b = ['Walker','Hacker','Drift','Echo','Flux','Shift','Pulse','Raven','Viper','Node','Core','Blade'];
  return a[Math.random() * a.length | 0] + b[Math.random() * b.length | 0] + (Math.random() * 100 | 0);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Today';
  const y = new Date(n); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function uid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : (Math.random() * 16 | 0 & 3 | 8)).toString(16));
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#00a884','#5b61b9','#d4a74b','#e5422b','#4a9d5e','#cb6d3e','#6c8fc7','#b93b6f','#389e7a','#cc5b3a'];
  return colors[Math.abs(h) % colors.length];
}

function initials(name) {
  return name.substring(0, 2).toUpperCase();
}

/* ═══════════════════ THEME ═══════════════════ */

function toggleTheme() {
  const dark = document.body.getAttribute('data-theme') !== 'light';
  document.body.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('ghost-theme', dark ? 'light' : 'dark');
  const el = document.getElementById('theme-btn-label');
  if (el) el.textContent = dark ? 'Light Mode' : 'Dark Mode';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#00a884' : '#1f2c33';
}

function loadTheme() {
  const s = localStorage.getItem('ghost-theme');
  if (s) {
    document.body.setAttribute('data-theme', s);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = s === 'light' ? '#00a884' : '#1f2c33';
  }
  const f = localStorage.getItem('ghost-font');
  if (f) {
    document.body.setAttribute('data-font', f);
    const sel = document.getElementById('font-select');
    if (sel) sel.value = f;
  }
}

function setFontSize(s) {
  document.body.setAttribute('data-font', s);
  localStorage.setItem('ghost-font', s);
}

/* ═══════════════════ NAVIGATION ═══════════════════ */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function goHome() {
  showScreen('screen-home');
  renderChatList();
  renderContactList();
  updateTotalUnread();
}

function goLanding() {
  showScreen('screen-landing');
  switchLandingTab('join');
}

function switchLandingTab(tab) {
  document.getElementById('ltab-join').classList.toggle('active', tab === 'join');
  document.getElementById('ltab-create').classList.toggle('active', tab === 'create');
  document.getElementById('landing-join').classList.toggle('hidden', tab !== 'join');
  document.getElementById('landing-create').classList.toggle('hidden', tab !== 'create');
}

function switchHomeTab(tab) {
  document.getElementById('tab-chats').classList.toggle('active', tab === 'chats');
  document.getElementById('tab-contacts').classList.toggle('active', tab === 'contacts');
  document.getElementById('content-chats').classList.toggle('hidden', tab !== 'chats');
  document.getElementById('content-contacts').classList.toggle('hidden', tab !== 'contacts');
  if (tab === 'contacts') renderContactList();
}

/* ═══════════════════ CONTACTS DB ═══════════════════ */

function getContacts() {
  try { return JSON.parse(localStorage.getItem('ghost-contacts')) || []; } catch(e) { return []; }
}

function saveContacts(contacts) {
  localStorage.setItem('ghost-contacts', JSON.stringify(contacts));
}

function addContact(name, roomCode) {
  const contacts = getContacts();
  if (contacts.find(c => c.roomCode === roomCode)) { showToast('Contact already exists'); return; }
  contacts.unshift({ id: uid(), name, roomCode, lastSeen: Date.now() });
  saveContacts(contacts);
  renderContactList();
  showToast('Contact saved: ' + name);
}

function removeContact(id) {
  let contacts = getContacts();
  contacts = contacts.filter(c => c.id !== id);
  saveContacts(contacts);
  renderContactList();
}

function saveCurrentRoomAsContact() {
  if (!roomCode) return;
  const name = roomDisplayName || roomName || roomCode;
  addContact(name, roomCode);
}

/* ═══════════════════ ROOMS DB ═══════════════════ */

function getRooms() {
  try { return JSON.parse(localStorage.getItem('ghost-rooms')) || []; } catch(e) { return []; }
}

function saveRooms(rooms) {
  localStorage.setItem('ghost-rooms', JSON.stringify(rooms));
}

function getRoom(code) {
  return getRooms().find(r => r.code === code);
}

function upsertRoom(code, updates) {
  const rooms = getRooms();
  const idx = rooms.findIndex(r => r.code === code);
  if (idx >= 0) {
    rooms[idx] = { ...rooms[idx], ...updates, code };
  } else {
    rooms.unshift({ code, name: code, lastMessage: '', lastTime: Date.now(), unread: 0, ...updates });
  }
  saveRooms(rooms);
}

function removeRoom(code) {
  let rooms = getRooms();
  rooms = rooms.filter(r => r.code !== code);
  saveRooms(rooms);
}

function updateTotalUnread() {
  const total = getRooms().reduce((s, r) => s + (r.unread || 0), 0);
  const badge = document.getElementById('total-unread');
  if (!badge) return;
  if (total > 0) { badge.textContent = total > 99 ? '99+' : total; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}

/* ═══════════════════ RENDER CHATS LIST ═══════════════════ */

function renderChatList() {
  const container = document.getElementById('chats-list');
  const rooms = getRooms();
  if (rooms.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#x1F4AC;</div>
      <p>No conversations yet</p>
      <p class="empty-sub">Create or join a room to start chatting</p>
      <button class="btn-primary" onclick="goLanding()">&#x1F4AD; New Chat</button>
    </div>`;
    return;
  }

  rooms.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  let html = '';
  rooms.forEach(r => {
    const timeStr = r.lastTime ? fmtDate(r.lastTime) : '';
    const msgPreview = r.lastMessage ? esc(r.lastMessage.substring(0, 60)) : 'No messages yet';
    const unread = r.unread || 0;
    const unreadBadge = unread > 0 ? `<span class="chat-item-unread">${unread > 99 ? '99+' : unread}</span>` : '';
    const ac = avatarColor(r.name);
    html += `<div class="chat-item" onclick="openChat('${r.code}')" oncontextmenu="event.preventDefault();deleteRoom('${r.code}')">
      <div class="chat-item-avatar" style="background:${ac}">${initials(r.name)}</div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <span class="chat-item-name">${esc(r.name)}</span>
          <span class="chat-item-time">${timeStr}</span>
        </div>
        <div class="chat-item-bottom">
          <span class="chat-item-msg">${msgPreview}</span>
          ${unreadBadge}
        </div>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

function deleteRoom(code) {
  if (!confirm('Delete this conversation?')) return;
  removeRoom(code);
  localStorage.removeItem('ghost-msgs-' + code);
  renderChatList();
  showToast('Conversation deleted');
}

/* ═══════════════════ RENDER CONTACTS LIST ═══════════════════ */

function renderContactList() {
  const container = document.getElementById('contacts-list');
  const contacts = getContacts();
  if (contacts.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#x1F464;</div>
      <p>No contacts saved</p>
      <p class="empty-sub">Save room codes as contacts for quick access</p>
      <button class="btn-primary" onclick="showAddContact()">&#x2795; Add Contact</button>
    </div>`;
    return;
  }
  let html = '';
  contacts.forEach(c => {
    const ac = avatarColor(c.name);
    html += `<div class="contact-item" onclick="openChat('${c.roomCode}')">
      <div class="contact-item-avatar" style="background:${ac}">${initials(c.name)}</div>
      <div class="contact-item-body">
        <div class="contact-item-name">${esc(c.name)}</div>
        <div class="contact-item-code">${esc(c.roomCode)}</div>
      </div>
      <span class="contact-item-action" onclick="event.stopPropagation();removeContact('${c.id}')">Delete</span>
    </div>`;
  });
  container.innerHTML = html;
}

/* ═══════════════════ OPEN / MANAGE CHAT ═══════════════════ */

function openChat(code) {
  if (peer && roomCode === code && !peer.destroyed) {
    showScreen('screen-chat');
    return;
  }
  if (peer) { peer.destroy(); peer = null; }
  connections = [];
  roomCode = code;
  roomPassword = '';
  isHost = false;
  currentRoomCode = code;

  const room = getRoom(code);
  roomDisplayName = room ? room.name : code;
  username = loadUsername();

  showScreen('screen-chat');
  document.getElementById('chat-title').textContent = roomDisplayName;
  document.getElementById('chat-sub').textContent = 'Connecting...';
  document.getElementById('messages').innerHTML = '';
  messageHistory = [];

  connectPeer(code, false);
  loadHistory();
}

/* ═══════════════════ ROOM LOGIC ═══════════════════ */

function createRoom() {
  username = loadUsername();
  roomCode = genCode();
  roomPassword = document.getElementById('create-password').value.trim();
  roomName = document.getElementById('room-name-input').value.trim() || roomCode;
  roomDisplayName = roomName;
  isHost = true;
  currentRoomCode = roomCode;
  upsertRoom(roomCode, { name: roomName, lastTime: Date.now() });

  if (roomPassword) document.getElementById('room-pw-notice').classList.remove('hidden');
  showScreen('screen-chat');
  document.getElementById('chat-title').textContent = roomName;
  document.getElementById('chat-sub').textContent = 'Creating room...';
  document.getElementById('messages').innerHTML = '';
  messageHistory = [];

  connectPeer(roomCode, true);
}

function joinRoom(code) {
  username = loadUsername();
  const input = document.getElementById('room-input');
  const pw = document.getElementById('room-password');
  code = code || input.value.trim().toUpperCase();
  if (code.length < 3) { showToast('Enter a valid room code'); return; }
  roomCode = code; roomPassword = pw.value.trim(); isHost = false;
  roomName = code; roomDisplayName = code;
  currentRoomCode = code;
  pw.value = ''; input.value = '';
  upsertRoom(code, { name: code, lastTime: Date.now() });

  showScreen('screen-chat');
  document.getElementById('chat-title').textContent = code;
  document.getElementById('chat-sub').textContent = 'Connecting...';
  document.getElementById('messages').innerHTML = '';
  messageHistory = [];

  connectPeer(code, false);
}

function connectPeer(code, host) {
  const pid = host ? 'ghost-' + code : undefined;
  peer = new Peer(pid, {
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]}, debug: 0
  });
  peer.on('open', id => {
    myPeerId = id;
    document.getElementById('chat-sub').textContent = 'Connected';
    if (host) {
      document.getElementById('room-pw-notice').classList.remove('hidden');
      document.getElementById('room-display').classList.remove('hidden');
      document.getElementById('room-code').textContent = code;
      generateQrCode(code);
    } else {
      const conn = peer.connect('ghost-' + code, { reliable: true });
      setupConnection(conn, false);
    }
    flushOfflineQueue();
  });
  peer.on('connection', conn => { if (isHost) setupConnection(conn, true); });
  peer.on('disconnected', () => {
    document.getElementById('chat-sub').textContent = 'Reconnecting...';
    showToast('Connection lost');
    peer.reconnect();
  });
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') { showToast('Room not found'); closeChat(); }
    else if (err.type !== 'disconnected') showToast('Connection error');
  });
}

function setupConnection(conn, incoming) {
  connections.push(conn);
  conn.on('open', () => {
    if (isHost) {
      if (roomPassword) { conn.send({ type: 'auth-request' }); conn._authed = false; return; }
      doneConn(conn);
    }
  });
  conn.on('data', data => {
    if (isHost && conn._authed === false) {
      if (data.type === 'auth-response' && data.password === roomPassword) { conn._authed = true; doneConn(conn); }
      else { conn.send({ type: 'auth-denied' }); setTimeout(() => { try { conn.close(); } catch(e) {} }, 500); }
      return;
    }
    if (!isHost && data.type === 'auth-request') { conn.send({ type: 'auth-response', password: roomPassword }); return; }
    if (data.type === 'auth-denied') { showToast('Wrong password'); closeChat(); return; }
    handleData(data, conn);
  });
  conn.on('close', () => {
    connections = connections.filter(c => c !== conn);
    sysMsg('A peer disconnected');
    updatePeers();
  });
}

function doneConn(conn) {
  conn.send({ type: 'user-join', username, peerId: myPeerId, timestamp: Date.now() });
  sysMsg(username + ' joined');
  updatePeers();
  broadcastToPeers({ type: 'peer-joined', username, peerId: myPeerId }, conn);
  peerUserMap[conn.peer] = { username, conn };
}

function handleData(data, conn) {
  switch (data.type) {
    case 'message':
      addMsg(data.username, data.text, data.timestamp, false, data.id, data.replyTo);
      if (data.destruct) scheduleDestruct(data.id, data.destruct);
      if (!isFocused || document.getElementById('screen-chat').classList.contains('hidden')) {
        const room = getRoom(roomCode);
        if (room) { room.unread = (room.unread || 0) + 1; saveRooms(getRooms()); updateTotalUnread(); }
      }
      playNotify(); vibrateDevice();
      break;
    case 'user-join': sysMsg(data.username + ' joined'); peerUserMap[data.peerId] = { username: data.username, conn }; if (isHost) broadcastToPeers({ type: 'peer-joined', username: data.username, peerId: data.peerId }, conn); updatePeers(); break;
    case 'welcome': sysMsg('Connected'); break;
    case 'peer-joined': sysMsg(data.username + ' joined'); peerUserMap[data.peerId] = { username: data.username }; updatePeers(); break;
    case 'file': addFileMsg(data.username, data.fileName, data.fileData, data.fileType, data.timestamp, false); playNotify(); vibrateDevice(); break;
    case 'typing': showTyping(data.username); break;
    case 'reaction': addReaction(data.messageId, data.reaction, data.username); break;
    case 'edit': editMsgDOM(data.id, data.text); break;
    case 'delete': delMsgDOM(data.id); break;
    case 'voice-msg': addVoiceMsg(data.username, data.audioData, data.timestamp, false); playNotify(); break;
    case 'screenshot': sysMsg('\u26A0 ' + data.username + ' may have taken a screenshot'); break;
    case 'gps': addMapMsg(data.username, data.lat, data.lng, data.timestamp, false); break;
    case 'kick': showToast('You were removed'); closeChat(); break;
    case 'room-locked': sysMsg('Room locked'); roomLocked = true; break;
    case 'relay': broadcastToPeers(data.message, conn); break;
  }
}

function broadcastToPeers(msg, excl) {
  connections.forEach(c => { if (c !== excl && c.open) c.send(msg); });
}

function closeChat() {
  if (peer) { peer.destroy(); peer = null; }
  connections = []; isHost = false; roomLocked = false; peerUserMap = {};
  document.getElementById('emoji-picker')?.classList.add('hidden');
  closeQrScan(); closeBleScan(); closeFileShare(); closeUserList(); closeChatInfo();
  goHome();
}

function updatePeers() {
  document.getElementById('chat-sub').textContent = connections.length + ' peer' + (connections.length !== 1 ? 's' : '');
}

function setNetStatus(text) {
  const el = document.getElementById('status-text');
  const badge = document.getElementById('net-badge');
  if (el) el.textContent = text;
  if (badge) badge.textContent = isOnline ? '\uD83C\uDF10 Cloud' : '\uD83D\uDCF4 Local';
}

/* ═══════════════════ MESSAGES ═══════════════════ */

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const msg = { type: 'message', username, text, timestamp: Date.now(), id: uid(), destruct: destructTimer, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, sender: replyTo.sender } : null };
  connections.forEach(c => { if (c.open) c.send(msg); });
  addMsg(username, text, Date.now(), true, msg.id, msg.replyTo);
  if (destructTimer) scheduleDestruct(msg.id, destructTimer);
  replyTo = null; document.getElementById('reply-bar').classList.add('hidden');
  upsertRoom(roomCode, { lastMessage: text, lastTime: Date.now() });
}

function addMsg(sender, text, timestamp, isOwn, id, replyToData) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'msg ' + (isOwn ? 'sent' : 'recv');
  d.dataset.id = id || uid();
  let html = '';
  if (replyToData) html += `<div class="rq">\u21B3 <strong>${esc(replyToData.sender)}</strong> ${esc(replyToData.text.substring(0, 80))}</div>`;
  if (!isOwn) html += `<div class="sender">${esc(sender)}</div>`;
  html += `<div class="text">${linkify(esc(text))}</div>
    <div class="time-wrap"><span>${fmtTime(timestamp)}</span></div>
    <div class="act">${isOwn ? `<button onclick="editPrompt('${id||''}')">Edit</button><button onclick="delMsg('${id||''}')">Del</button>` : ''}<button onclick="replyMsg('${id||''}','${esc(sender)}','${esc(text.substring(0,80))}')">Reply</button><button onclick="reactMsg('${id||''}')">React</button></div>
    <div class="reactions" id="rx-${id||''}"></div>`;
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
  messageHistory.push({ sender, text, timestamp, isOwn, id: id||uid() });
  saveHistory();
}

function linkify(t) {
  return t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function sysMsg(text) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'sys-msg';
  d.textContent = '\uD83D\uDD35 ' + text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addFileMsg(sender, fileName, fileData, fileType, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'msg ' + (isOwn ? 'sent' : 'recv');
  const ext = fileName.split('.').pop().toLowerCase();
  const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  let html = '';
  if (!isOwn) html += `<div class="sender">${esc(sender)}</div>`;
  if (isImg && fileData) html += `<img src="data:${fileType};base64,${fileData}" onclick="window.open(this.src)">`;
  else html += `<div class="file-m" onclick="dlFile('${fileData}','${esc(fileName)}','${fileType}')">\uD83D\uDCCE ${esc(fileName)}</div>`;
  html += `<div class="time-wrap"><span>${fmtTime(timestamp)}</span></div>`;
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addVoiceMsg(sender, audioData, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'msg ' + (isOwn ? 'sent' : 'recv');
  let html = '';
  if (!isOwn) html += `<div class="sender">${esc(sender)}</div>`;
  html += `<audio controls src="data:audio/webm;base64,${audioData}"></audio><div class="time-wrap"><span>${fmtTime(timestamp)}</span></div>`;
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addMapMsg(sender, lat, lng, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'msg ' + (isOwn ? 'sent' : 'recv');
  let html = '';
  if (!isOwn) html += `<div class="sender">${esc(sender)}</div>`;
  html += `<div style="font-size:13px">\uD83D\uDCCD Location</div>
    <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="color:var(--accent);font-size:13px">View on Maps</a>
    <div class="time-wrap"><span>${fmtTime(timestamp)}</span></div>`;
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function editPrompt(id) {
  const el = document.getElementById('messages').querySelector(`[data-id="${id}"]`);
  if (!el) return;
  const textEl = el.querySelector('.text');
  const newText = prompt('Edit:', textEl.textContent);
  if (newText && newText.trim()) {
    connections.forEach(c => { if (c.open) c.send({ type: 'edit', id, text: newText.trim() }); });
    editMsgDOM(id, newText.trim());
  }
}

function editMsgDOM(id, text) {
  const el = document.getElementById('messages').querySelector(`[data-id="${id}"]`);
  if (el) { el.querySelector('.text').innerHTML = linkify(esc(text)); el.querySelector('.text').style.fontStyle = 'italic'; }
}

function delMsg(id) {
  connections.forEach(c => { if (c.open) c.send({ type: 'delete', id }); });
  delMsgDOM(id);
}

function delMsgDOM(id) {
  const el = document.getElementById('messages').querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
}

function replyMsg(id, sender, text) {
  replyTo = { id, sender, text };
  document.getElementById('reply-preview').textContent = sender + ': ' + text.substring(0, 80);
  document.getElementById('reply-bar').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}

function cancelReply() { replyTo = null; document.getElementById('reply-bar').classList.add('hidden'); }

/* ───── REACTIONS ───── */

function reactMsg(id) {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);padding:8px;display:flex;gap:6px;z-index:200;border-radius:8px;box-shadow:var(--shadow)';
  const emojis = ['\uD83D\uDC4D','\u2764\uFE0F','\uD83D\uDE02','\uD83D\uDE2E','\uD83D\uDE22','\uD83D\uDD25','\uD83C\uDF89','\uD83D\uDC40','\uD83D\uDE0D','\uD83D\uDE20','\uD83E\uDD10','\uD83D\uDE4F'];
  emojis.forEach(e => {
    const b = document.createElement('button');
    b.textContent = e; b.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:6px';
    b.onmouseenter = () => b.style.background = 'var(--bg3)';
    b.onmouseleave = () => b.style.background = 'none';
    b.onclick = () => { p.remove(); sendReaction(id, e); };
    p.appendChild(b);
  });
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 5000);
}

function sendReaction(id, reaction) {
  connections.forEach(c => { if (c.open) c.send({ type: 'reaction', messageId: id, reaction, username }); });
  addReaction(id, reaction, username);
}

function addReaction(id, reaction, sender) {
  const el = document.getElementById('rx-' + id);
  if (!el) return;
  const s = document.createElement('span');
  s.title = sender; s.textContent = reaction;
  el.appendChild(s);
}

/* ───── SELF-DESTRUCT ───── */

function toggleDestruct() {
  const timers = [0, 5, 10, 30, 60, 300];
  const idx = timers.indexOf(destructTimer);
  destructTimer = timers[(idx + 1) % timers.length];
  const btn = document.getElementById('destruct-btn');
  if (destructTimer > 0) { btn.classList.add('on'); showToast('Self-destruct: ' + destructTimer + 's'); }
  else { btn.classList.remove('on'); showToast('Self-destruct off'); }
}

function scheduleDestruct(id, sec) {
  if (sec <= 0) return;
  setTimeout(() => { try { delMsgDOM(id); } catch(e) {} }, sec * 1000);
}

/* ───── FILE ───── */

function attachFile() { document.getElementById('overlay-file').classList.remove('hidden'); }
function closeFileShare() { document.getElementById('overlay-file').classList.add('hidden'); }

function sendFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = function(e) {
    const b64 = e.target.result.split(',')[1];
    const msg = { type: 'file', username, fileName: file.name, fileData: b64, fileType: file.type, timestamp: Date.now() };
    connections.forEach(c => { if (c.open) c.send(msg); });
    addFileMsg(username, file.name, b64, file.type, Date.now(), true);
    showToast('Sent: ' + file.name);
    closeFileShare(); event.target.value = '';
  };
  r.readAsDataURL(file);
}

function dlFile(data, name, type) {
  const a = document.createElement('a');
  a.href = 'data:' + type + ';base64,' + data; a.download = name; a.click();
}

/* ───── VOICE ───── */

async function startVoiceStream() {
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(voiceStream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start();
  } catch(e) { showToast('Mic access denied'); }
}

function stopVoiceStream() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const r = new FileReader();
      r.onload = function(e) {
        const b64 = e.target.result.split(',')[1];
        const msg = { type: 'voice-msg', username, audioData: b64, timestamp: Date.now() };
        connections.forEach(c => { if (c.open) c.send(msg); });
        addVoiceMsg(username, b64, Date.now(), true);
      };
      r.readAsDataURL(blob);
      if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
      voiceStream = null;
    };
  }
}

/* ───── GPS ───── */

function shareLocation() {
  if (!navigator.geolocation) { showToast('GPS not available'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const msg = { type: 'gps', username, lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
    connections.forEach(c => { if (c.open) c.send(msg); });
    addMapMsg(username, pos.coords.latitude, pos.coords.longitude, Date.now(), true);
    showToast('Location shared');
    closeSettings();
  }, () => showToast('GPS access denied'), { enableHighAccuracy: true, timeout: 10000 });
}

/* ───── EMOJI ───── */

const EMOJIS = ['\uD83D\uDE00','\uD83D\uDE01','\uD83D\uDE02','\uD83E\uDD23','\uD83D\uDE03','\uD83D\uDE04','\uD83D\uDE05','\uD83D\uDE06','\uD83D\uDE09','\uD83D\uDE0A','\uD83D\uDE0B','\uD83D\uDE0E','\uD83D\uDE0D','\uD83E\uDD70','\uD83D\uDE18','\uD83D\uDE1C','\uD83D\uDE1D','\uD83D\uDE12','\uD83D\uDE0F','\uD83D\uDE4A','\uD83D\uDC4D','\uD83D\uDC4E','\uD83D\uDC4C','\u270B','\uD83E\uDD1B','\uD83E\uDD1C','\uD83D\uDC4F','\uD83D\uDC46','\uD83D\uDC47','\uD83D\uDC48','\uD83D\uDC49','\uD83D\uDC4A','\u2764\uFE0F','\uD83E\uDDE1','\uD83D\uDC9B','\uD83D\uDC9A','\uD83D\uDC99','\uD83D\uDC9C','\uD83D\uDDA4','\uD83D\uDC94','\uD83D\uDC95','\uD83D\uDC96','\uD83D\uDC97','\uD83D\uDC98','\uD83D\uDC8E','\u2728','\u2B50','\uD83C\uDF1F','\uD83D\uDD25','\uD83C\uDF89','\uD83C\uDF88','\uD83C\uDF81','\uD83C\uDF8A','\uD83C\uDF8F','\uD83D\uDCBB','\uD83D\uDCF1','\uD83D\uDD10','\uD83D\uDD11','\uD83D\uDCA1','\uD83D\uDCF7','\uD83C\uDFA4','\uD83C\uDFA7','\uD83C\uDFAE','\uD83D\uDD14','\u23F0','\uD83E\uDDE0','\uD83D\uDCAC','\uD83D\uDCDD','\u2709\uFE0F','\uD83D\uDCE8','\uD83D\uDCE9','\uD83D\uDD17','\uD83C\uDFAF','\uD83C\uDFC6','\uD83D\uDE80','\uD83D\uDEF8','\u2728'];

function toggleEmojiPicker() {
  const p = document.getElementById('emoji-picker');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  if (p.children.length === 0) {
    EMOJIS.forEach(e => {
      const b = document.createElement('button');
      b.textContent = e;
      b.onclick = () => { insertEmoji(e); };
      p.appendChild(b);
    });
  }
}

function insertEmoji(e) {
  const input = document.getElementById('chat-input');
  input.value += e; input.focus();
}

/* ───── STEALTH ───── */

let calcExpr = '0';
function toggleStealth() {
  document.getElementById('screen-chat').classList.toggle('hidden');
  document.getElementById('screen-calc').classList.toggle('hidden');
}
function calcInput(v) { calcExpr = (calcExpr === '0' ? '' : calcExpr) + v; document.getElementById('calc-display').textContent = calcExpr; }
function calcOp(v) { calcExpr += v; document.getElementById('calc-display').textContent = calcExpr; }
function calcResult() { try { calcExpr = String(eval(calcExpr)); } catch(e) { calcExpr = 'Error'; } document.getElementById('calc-display').textContent = calcExpr; }
function calcClear() { calcExpr = '0'; document.getElementById('calc-display').textContent = '0'; }

/* ───── SEARCH ───── */

function toggleSearch() {
  document.getElementById('search-bar').classList.toggle('hidden');
  if (!document.getElementById('search-bar').classList.contains('hidden')) document.getElementById('search-input').focus();
  else clearSearch();
}

function closeSearch() { document.getElementById('search-bar').classList.add('hidden'); clearSearch(); }

function searchMessages(q) {
  document.querySelectorAll('#messages .msg, #messages .sys-msg').forEach(el => {
    el.style.display = (!q || el.textContent.toLowerCase().includes(q.toLowerCase())) ? '' : 'none';
  });
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchMessages('');
}

/* ───── USER LIST ───── */

function showUserList() {
  const c = document.getElementById('users-content');
  c.innerHTML = '<div class="user-entry"><span>You (' + username + ')</span></div>';
  Object.keys(peerUserMap).forEach(k => {
    const d = document.createElement('div');
    d.className = 'user-entry';
    d.innerHTML = '<span>' + esc(peerUserMap[k].username) + '</span>';
    if (isHost) {
      const kick = document.createElement('button');
      kick.textContent = 'Kick'; kick.className = 'btn-sm btn-danger';
      kick.onclick = () => { connections.forEach(c => { if (c.peer === k || c.peer === 'ghost-' + k) { c.send({ type: 'kick' }); c.close(); } }); showToast('User kicked'); closeUserList(); };
      d.appendChild(kick);
    }
    c.appendChild(d);
  });
  document.getElementById('overlay-users').classList.remove('hidden');
}

function closeUserList() { document.getElementById('overlay-users').classList.add('hidden'); }

/* ───── SCREENSHOT DETECT ───── */

let lastSA = 0;
function screenshotDetect() {
  const n = Date.now();
  if (n - lastSA < 5000) return;
  lastSA = n;
  connections.forEach(c => { if (c.open) c.send({ type: 'screenshot', username, timestamp: n }); });
}

/* ───── QR ───── */

function generateQrCode(code) {
  const container = document.getElementById('qr-container');
  container.classList.remove('hidden');
  container.innerHTML = '<div id="qrcode"></div>';
  qrCodeInstance = new QRCode(document.getElementById('qrcode'), {
    text: 'ghostchat://join/' + code,
    width: 150, height: 150,
    colorDark: '#00a884', colorLight: '#ffffff'
  });
}

function showQrScan() {
  document.getElementById('overlay-qr').classList.remove('hidden');
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, t => {
    html5QrCode.stop();
    const m = t.match(/ghostchat:\/\/join\/(\w+)/);
    closeQrScan();
    setTimeout(() => joinRoom(m ? m[1] : t.trim()), 300);
  }, () => {})
    .catch(() => { showToast('Camera access denied'); closeQrScan(); });
}

function closeQrScan() {
  try { if (html5QrCode) html5QrCode.stop(); } catch(e) {}
  document.getElementById('overlay-qr').classList.add('hidden');
}

/* ───── BLE ───── */

function showBleScan() { document.getElementById('overlay-ble').classList.remove('hidden'); }
function closeBleScan() { document.getElementById('overlay-ble').classList.add('hidden'); }

function startBleScan() {
  if (typeof navigator.bluetooth === 'undefined') { showToast('BLE requires Android APK'); return; }
  navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb'] })
    .then(dev => {
      bleDevice = dev;
      document.getElementById('ble-list').innerHTML = `<div class="ble-entry"><span class="name">${esc(dev.name||'Unknown')}</span><span class="action" onclick="connectBle()">Connect</span></div>`;
    })
    .catch(() => { document.getElementById('ble-list').innerHTML = '<p class="sheet-hint">No device selected</p>'; });
}

function connectBle() {
  if (!bleDevice) return;
  bleDevice.gatt.connect().then(server => {
    showToast('BLE: ' + bleDevice.name);
    if (roomCode) {
      server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb').then(svc =>
        svc.getCharacteristic('0000ff01-0000-1000-8000-00805f9b34fb').then(ch => {
          ch.writeValue(new TextEncoder().encode('JOIN:' + roomCode));
          showToast('Room code sent via BLE');
        })
      ).catch(() => showToast('BLE service not found'));
    }
  }).catch(() => showToast('BLE connection failed'));
}

/* ───── EXPORT ───── */

function exportChat() {
  let h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ghost Chat - ' + esc(roomCode) + '</title>';
  h += '<style>body{background:#111b21;color:#e9edef;font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto}.m{padding:8px 12px;margin:6px 0;border-radius:8px;background:#1f2c33}.s{text-align:center;color:#667781;font-style:italic;font-size:13px}.t{color:#8696a0;font-size:12px}.h{font-size:13px;color:#00a884;font-weight:700}</style></head><body>';
  h += '<h1 style="color:#00a884">Ghost Chat</h1><p style="color:#667781;font-size:14px">Room: ' + esc(roomCode) + '</p><hr style="border-color:#313d45">';
  document.querySelectorAll('#messages .msg, #messages .sys-msg').forEach(el => {
    if (el.classList.contains('sys-msg')) h += '<p class="s">' + esc(el.textContent) + '</p>';
    else {
      const s = el.querySelector('.sender')?.textContent || 'You';
      const t = el.querySelector('.text')?.textContent || '';
      const tm = el.querySelector('.time-wrap span')?.textContent || '';
      h += '<div class="m"><span class="h">' + esc(s) + '</span> ' + esc(t) + ' <span class="t">' + esc(tm) + '</span></div>';
    }
  });
  h += '</body></html>';
  const blob = new Blob([h], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ghost-chat-' + roomCode + '-' + Date.now() + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Chat exported');
}

/* ───── NOTIFICATIONS ───── */

let actx = null;
function playNotify() {
  if (!soundEnabled) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
    o.start(); o.stop(actx.currentTime + 0.12);
  } catch(e) {}
}

function vibrateDevice() { if (vibrateEnabled && navigator.vibrate) navigator.vibrate(40); }

/* ───── NETWORK ───── */

function handleOnline() {
  isOnline = true;
  setNetStatus('Online');
  if (peer && peer.disconnected) { peer.reconnect(); showToast('Reconnecting...'); }
}

function handleOffline() {
  isOnline = false;
  setNetStatus('Offline');
  showToast('Offline — use QR/BLE');
}

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

/* ───── OFFLINE QUEUE ───── */

function queueOffline(msg) {
  offlineQueue.push(msg);
  try { localStorage.setItem('ghost-queue-' + roomCode, JSON.stringify(offlineQueue)); } catch(e) {}
}

function flushOfflineQueue() {
  if (offlineQueue.length === 0) return;
  const q = [...offlineQueue];
  offlineQueue = [];
  localStorage.removeItem('ghost-queue-' + roomCode);
  q.forEach(msg => { connections.forEach(c => { if (c.open) c.send(msg); }); });
}

/* ───── HISTORY ───── */

function saveHistory() {
  try {
    const recent = messageHistory.slice(-300);
    localStorage.setItem('ghost-msgs-' + roomCode, JSON.stringify(recent));
  } catch(e) {}
}

function loadHistory() {
  try {
    const s = localStorage.getItem('ghost-msgs-' + roomCode);
    if (s) {
      JSON.parse(s).forEach(m => { if (m.text) addMsg(m.sender, m.text, m.timestamp, m.isOwn, m.id); });
      const msgsEl = document.getElementById('messages');
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  } catch(e) {}
}

/* ───── SETTINGS ───── */

function showSettings() {
  document.getElementById('username-input').value = loadUsername();
  document.getElementById('overlay-settings').classList.remove('hidden');
}
function closeSettings() { document.getElementById('overlay-settings').classList.add('hidden'); }

function saveUsername() {
  const n = document.getElementById('username-input').value.trim() || genName();
  username = n;
  localStorage.setItem('ghost-username', n);
  showToast('Username: ' + n);
}

function loadUsername() { return localStorage.getItem('ghost-username') || genName(); }

function clearHistory() {
  messageHistory = [];
  localStorage.removeItem('ghost-msgs-' + roomCode);
  document.getElementById('messages').innerHTML = '';
  sysMsg('History cleared');
  showToast('History cleared');
}

/* ───── SOUND/VIBRATE PREFS ───── */

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-cb').checked = soundEnabled;
  localStorage.setItem('ghost-sound', soundEnabled ? '1' : '0');
}

function toggleVibrate() {
  vibrateEnabled = !vibrateEnabled;
  document.getElementById('vibrate-cb').checked = vibrateEnabled;
  localStorage.setItem('ghost-vibrate', vibrateEnabled ? '1' : '0');
}

function loadPrefs() {
  soundEnabled = localStorage.getItem('ghost-sound') !== '0';
  vibrateEnabled = localStorage.getItem('ghost-vibrate') !== '0';
  const sc = document.getElementById('sound-cb');
  const vc = document.getElementById('vibrate-cb');
  if (sc) sc.checked = soundEnabled;
  if (vc) vc.checked = vibrateEnabled;
}

/* ───── ADD CONTACT ───── */

function showAddContact() { document.getElementById('overlay-add-contact').classList.remove('hidden'); }
function closeAddContact() { document.getElementById('overlay-add-contact').classList.add('hidden'); }

function saveContact() {
  const name = document.getElementById('contact-name-input').value.trim();
  const code = document.getElementById('contact-code-input').value.trim().toUpperCase();
  if (!name || !code) { showToast('Fill in both fields'); return; }
  addContact(name, code);
  document.getElementById('contact-name-input').value = '';
  document.getElementById('contact-code-input').value = '';
  closeAddContact();
  switchHomeTab('contacts');
}

/* ───── CHAT INFO ───── */

function showChatInfo() {
  document.getElementById('info-code').textContent = roomCode;
  document.getElementById('info-name').textContent = roomDisplayName || roomCode;
  document.getElementById('info-peers').textContent = connections.length;
  document.getElementById('info-pw').textContent = roomPassword ? 'Yes' : 'No';
  document.getElementById('overlay-chat-info').classList.remove('hidden');
}

function closeChatInfo() { document.getElementById('overlay-chat-info').classList.add('hidden'); }

/* ───── TYPING ───── */

function showTyping(sender) {
  const el = document.getElementById('typing-indicator');
  if (!el) return;
  document.getElementById('typing-text').textContent = sender + ' is typing...';
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2000);
}

/* ───── TOAST ───── */

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ───── COPY ───── */

function copyRoomCode() {
  const el = document.getElementById('room-code');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => showToast('Copied')).catch(() => showToast('Copy failed'));
}

/* ───── INIT ───── */

loadTheme();
loadPrefs();
username = loadUsername();
setNetStatus(isOnline ? 'Online' : 'Offline');

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSettings(); closeQrScan(); closeBleScan(); closeFileShare(); closeUserList(); closeChatInfo(); closeAddContact();
    document.getElementById('search-bar')?.classList.add('hidden');
    document.getElementById('emoji-picker')?.classList.add('hidden');
    cancelReply();
  }
});

if (getRooms().length > 0) {
  goHome();
} else {
  goLanding();
}
