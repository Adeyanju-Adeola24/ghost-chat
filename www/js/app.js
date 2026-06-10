/* ═══════════════════════════════════════════════
   GHOST CHAT v2.0 — P2P Encrypted Messenger
   ═══════════════════════════════════════════════ */

let peer = null, connections = [], myPeerId = null, roomCode = '', isHost = false, username = '';
let qrCodeInstance = null, html5QrCode = null, bleDevice = null;
let typingTimeout = null, messageHistory = [];
let soundEnabled = true, vibrateEnabled = true;
let replyTo = null, destructTimer = 0, editMsgId = null;
let roomLocked = false, roomPassword = '', roomName = '';
let unreadCount = 0, isFocused = true;
let mediaRecorder = null, audioChunks = [], voiceStream = null;
let peerUserMap = {}, offlineQueue = [];

window.addEventListener('focus', () => isFocused = true);
window.addEventListener('blur', () => { isFocused = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) screenshotDetect();
  else isFocused = true;
});

/* ─────────────── UTILITIES ─────────────── */

function generateCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function generateUsername() {
  const a = ['Ghost','Shadow','Phantom','Void','Null','Dark','Cyber','Neon','Matrix','Echo','Flux','Cipher'];
  const b = ['Walker','Hacker','Drift','Echo','Flux','Shift','Pulse','Raven','Viper','Node','Core','Blade'];
  return a[Math.floor(Math.random()*a.length)] + b[Math.floor(Math.random()*b.length)] + Math.floor(Math.random()*100);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function getDateLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function uuid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => (c==='x'?Math.random()*16|0:(Math.random()*16|0&0x3|0x8)).toString(16));
}

function base64ToBlob(b64, type) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

/* ─────────────── THEME ─────────────── */

function toggleTheme() {
  const body = document.body;
  const dark = body.getAttribute('data-theme') !== 'light';
  body.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('theme-icon').textContent = dark ? '\u2600\uFE0F' : '\uD83C\uDF19';
  updateThemeMeta(dark ? 'light' : 'dark');
  const cb = document.getElementById('theme-btn-toggle');
  if (cb) cb.textContent = dark ? 'Light Mode' : 'Dark Mode';
  localStorage.setItem('ghost-theme', dark ? 'light' : 'dark');
}

function updateThemeMeta(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#1f2c33' : '#00a884';
}

function loadTheme() {
  const s = localStorage.getItem('ghost-theme');
  if (s) {
    document.body.setAttribute('data-theme', s);
    updateThemeMeta(s);
    document.getElementById('theme-icon').textContent = s === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }
  const f = localStorage.getItem('ghost-font');
  if (f) {
    document.body.setAttribute('data-font', f);
    const sel = document.getElementById('font-size-select');
    if (sel) sel.value = f;
  }
}

function setFontSize(s) {
  document.body.setAttribute('data-font', s);
  localStorage.setItem('ghost-font', s);
}

/* ─────────────── LANDING TABS ─────────────── */

function switchLandingTab(tab) {
  document.getElementById('tab-join').classList.toggle('active', tab === 'join');
  document.getElementById('tab-create').classList.toggle('active', tab === 'create');
  document.getElementById('landing-join').classList.toggle('hidden', tab !== 'join');
  document.getElementById('landing-create').classList.toggle('hidden', tab !== 'create');
}

/* ─────────────── SOUND & VIBRATION ─────────────── */

let audioCtx = null;

function playNotification() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(); osc.stop(audioCtx.currentTime + 0.15);
  } catch(e) {}
}

function vibrateDevice() {
  if (vibrateEnabled && navigator.vibrate) navigator.vibrate(50);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-check').checked = soundEnabled;
  localStorage.setItem('ghost-sound', soundEnabled ? '1' : '0');
}

function toggleVibrate() {
  vibrateEnabled = !vibrateEnabled;
  document.getElementById('vibrate-check').checked = vibrateEnabled;
  localStorage.setItem('ghost-vibrate', vibrateEnabled ? '1' : '0');
}

/* ─────────────── ROOM LOGIC ─────────────── */

function createRoom() {
  username = loadUsername();
  roomCode = generateCode();
  roomPassword = document.getElementById('create-password').value.trim();
  roomName = document.getElementById('room-name-input').value.trim() || roomCode;
  isHost = true;
  if (roomPassword) document.getElementById('room-pw-notice').classList.remove('hidden');
  connectPeer(roomCode, true);
}

function joinRoom(code) {
  username = loadUsername();
  const input = document.getElementById('room-input');
  const pw = document.getElementById('room-password').value.trim();
  code = code || input.value.trim().toUpperCase();
  if (code.length < 3) { showToast('Enter a valid room code'); return; }
  roomCode = code; roomPassword = pw; isHost = false;
  roomName = roomCode;
  input.value = '';
  connectPeer(roomCode, false);
}

function connectPeer(code, host) {
  setStatus('Connecting...', false);
  const pid = host ? 'ghost-' + code : undefined;
  peer = new Peer(pid, {
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]}, debug: 0
  });
  peer.on('open', id => {
    myPeerId = id;
    setStatus('Connected', true);
    if (host) {
      document.getElementById('room-display').classList.remove('hidden');
      document.getElementById('room-code').textContent = code;
      generateQrCode(code);
      enterChat();
      document.getElementById('chat-room-name').textContent = roomName || code;
      if (roomPassword) document.getElementById('chat-room-status').textContent = 'Password protected';
    } else {
      const conn = peer.connect('ghost-' + code, { reliable: true });
      setupConnection(conn, false);
      enterChat();
      document.getElementById('chat-room-name').textContent = roomName || code;
    }
    flushOfflineQueue();
  });
  peer.on('connection', conn => { if (isHost) setupConnection(conn, true); });
  peer.on('disconnected', () => { setStatus('Reconnecting...', false); showToast('Connection lost'); peer.reconnect(); });
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') { showToast('Room not found'); leaveRoom(); }
    else if (err.type !== 'disconnected') showToast('Connection error');
  });
}

function setupConnection(conn, incoming) {
  connections.push(conn);
  conn.on('open', () => {
    if (isHost) {
      if (roomPassword) {
        conn.send({ type: 'auth-request' });
        conn._authed = false;
        return;
      }
      finalizeConnection(conn);
    }
  });
  conn.on('data', data => {
    if (isHost && conn._authed === false) {
      if (data.type === 'auth-response' && data.password === roomPassword) {
        conn._authed = true;
        finalizeConnection(conn);
      } else {
        conn.send({ type: 'auth-denied' });
        setTimeout(() => { try { conn.close(); } catch(e) {} }, 500);
      }
      return;
    }
    if (!isHost && data.type === 'auth-request') {
      conn.send({ type: 'auth-response', password: roomPassword });
      return;
    }
    if (data.type === 'auth-denied') { showToast('Wrong password'); leaveRoom(); return; }
    handleData(data, conn);
  });
  conn.on('close', () => {
    connections = connections.filter(c => c !== conn);
    addSystemMessage('A peer disconnected');
    updatePeerCount();
  });
}

function finalizeConnection(conn) {
  conn.send({ type: 'user-join', username, peerId: myPeerId, timestamp: Date.now() });
  addSystemMessage(username + ' joined');
  updatePeerCount();
  broadcastToPeers({ type: 'peer-joined', username, peerId: myPeerId }, conn);
  peerUserMap[conn.peer] = { username, conn };
}

function handleData(data, conn) {
  switch (data.type) {
    case 'message':
      addMessage(data.username, data.text, data.timestamp, false, data.id, data.replyTo);
      if (data.destruct) scheduleDestruct(data.id, data.destruct);
      if (!isFocused) { unreadCount++; updateUnreadBadge(unreadCount); }
      playNotification(); vibrateDevice();
      break;
    case 'user-join': addSystemMessage(data.username + ' joined'); peerUserMap[data.peerId] = { username: data.username, conn }; if (isHost) broadcastToPeers({ type: 'peer-joined', username: data.username, peerId: data.peerId }, conn); updatePeerCount(); break;
    case 'welcome': addSystemMessage('Connected to room'); setRoomStatus(data.roomCode); break;
    case 'peer-joined': addSystemMessage(data.username + ' joined'); peerUserMap[data.peerId] = { username: data.username }; updatePeerCount(); break;
    case 'file': addFileMessage(data.username, data.fileName, data.fileData, data.fileType, data.timestamp, false); if (!isFocused) { unreadCount++; updateUnreadBadge(unreadCount); } playNotification(); vibrateDevice(); break;
    case 'typing': showTypingIndicator(data.username); break;
    case 'reaction': addReaction(data.messageId, data.reaction, data.username); break;
    case 'edit': editMessageDOM(data.id, data.text); break;
    case 'delete': deleteMessageDOM(data.id); break;
    case 'voice-msg': addVoiceMessage(data.username, data.audioData, data.timestamp, false); playNotification(); break;
    case 'screenshot': addSystemMessage('\u26A0 ' + data.username + ' may have taken a screenshot'); break;
    case 'gps': addMapMessage(data.username, data.lat, data.lng, data.timestamp, false); break;
    case 'kick': showToast('You were removed from the room'); leaveRoom(); break;
    case 'room-locked': addSystemMessage('Room locked by host'); roomLocked = true; break;
    case 'relay': broadcastToPeers(data.message, conn); break;
  }
}

function broadcastToPeers(msg, exclude) {
  connections.forEach(c => { if (c !== exclude && c.open) c.send(msg); });
}

function enterChat() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('chat').classList.remove('hidden');
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('chat-input').addEventListener('input', () => {
    clearTimeout(typingTimeout);
    connections.forEach(c => { if (c.open) c.send({ type: 'typing', username }); });
    typingTimeout = setTimeout(() => {}, 1000);
  });
  setRoomStatus(isHost ? 'Room: ' + roomCode : 'Connecting...');
  loadHistory();
}

function leaveRoom() {
  if (peer) { peer.destroy(); peer = null; }
  connections = []; isHost = false; roomLocked = false; peerUserMap = {};
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('chat').classList.add('hidden');
  document.getElementById('messages').innerHTML = '';
  document.getElementById('room-display').classList.add('hidden');
  document.getElementById('room-pw-notice').classList.add('hidden');
  document.getElementById('search-bar').classList.add('hidden');
  if (qrCodeInstance) { qrCodeInstance.clear(); qrCodeInstance = null; }
  closeQrScan(); closeBleScan(); closeSettings(); closeFileShare(); closeUserList();
  document.getElementById('emoji-picker')?.classList.add('hidden');
  if (document.getElementById('calculator') && !document.getElementById('calculator').classList.contains('hidden')) toggleStealth();
  setStatus('Ready', false);
}

function setRoomStatus(text) {
  const el = document.getElementById('chat-room-status');
  if (el) el.textContent = text;
}

function setStatus(text, online) {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('connection-status-text');
  const mode = document.getElementById('network-mode');
  if (dot) dot.classList.toggle('online', online);
  if (label) label.textContent = text;
  if (mode) mode.textContent = isOnline ? '\uD83C\uDF10 Cloud' : '\uD83D\uDCF4 Local';
}

/* ─────────────── MESSAGES ─────────────── */

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const msg = { type: 'message', username, text, timestamp: Date.now(), id: uuid(), destruct: destructTimer, replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, sender: replyTo.sender } : null };
  connections.forEach(c => { if (c.open) c.send(msg); });
  addMessage(username, text, Date.now(), true, msg.id, msg.replyTo);
  if (destructTimer) scheduleDestruct(msg.id, destructTimer);
  replyTo = null; document.getElementById('reply-bar').classList.add('hidden');
}

function addMessage(sender, text, timestamp, isOwn, id, replyToData) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message ' + (isOwn ? 'sent' : 'received');
  d.dataset.id = id || uuid();
  let html = '';
  if (replyToData) html += '<div class="reply-quote">\u21B3 <strong>' + escapeHtml(replyToData.sender) + '</strong> ' + escapeHtml(replyToData.text.substring(0,80)) + '</div>';
  if (!isOwn) html += '<div class="sender">' + escapeHtml(sender) + '</div>';
  html += '<div class="text">' + linkify(escapeHtml(text)) + '</div>' +
    '<div class="time"><span>' + getTime(timestamp) + '</span></div>' +
    '<div class="msg-actions">' +
    (isOwn ? '<button onclick="editMessagePrompt(\'' + (id||'') + '\')">Edit</button><button onclick="deleteMessage(\'' + (id||'') + '\')">Del</button>' : '') +
    '<button onclick="replyToMessage(\'' + (id||'') + '\',\'' + escapeHtml(sender) + '\',\'' + escapeHtml(text.substring(0,80)) + '\')">Reply</button>' +
    '<button onclick="reactToMessage(\'' + (id||'') + '\')">React</button></div>' +
    '<div class="reactions" id="reactions-' + (id||'') + '"></div>';
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
  messageHistory.push({ sender, text, timestamp, isOwn, id: id||uuid() });
  saveHistory();
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function addDateSeparator(ts) {
  const d = document.getElementById('messages');
  const sep = document.createElement('div');
  sep.className = 'system-msg date-sep';
  sep.textContent = getDateLabel(ts);
  d.appendChild(sep);
}

function addSystemMessage(text) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'system-msg';
  d.textContent = '\uD83D\uDD35 ' + text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addFileMessage(sender, fileName, fileData, fileType, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message ' + (isOwn ? 'sent' : 'received');
  const ext = fileName.split('.').pop().toLowerCase();
  const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  let html = '';
  if (!isOwn) html += '<div class="sender">' + escapeHtml(sender) + '</div>';
  if (isImg && fileData) html += '<img src="data:' + fileType + ';base64,' + fileData + '" onclick="window.open(this.src)">';
  else html += '<div class="file-msg" onclick="downloadFile(\'' + fileData + '\',\'' + escapeHtml(fileName) + '\',\'' + fileType + '\')">\uD83D\uDCCE ' + escapeHtml(fileName) + '</div>';
  html += '<div class="time"><span>' + getTime(timestamp) + '</span></div>';
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addVoiceMessage(sender, audioData, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message ' + (isOwn ? 'sent' : 'received');
  let html = '';
  if (!isOwn) html += '<div class="sender">' + escapeHtml(sender) + '</div>';
  html += '<audio controls src="data:audio/webm;base64,' + audioData + '"></audio>' +
    '<div class="time"><span>' + getTime(timestamp) + '</span></div>';
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addMapMessage(sender, lat, lng, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message ' + (isOwn ? 'sent' : 'received');
  let html = '';
  if (!isOwn) html += '<div class="sender">' + escapeHtml(sender) + '</div>';
  html += '<div style="font-size:13px">\uD83D\uDCCD Location</div>' +
    '<a href="https://www.google.com/maps?q=' + lat + ',' + lng + '" target="_blank" style="color:var(--accent);font-size:13px">View on Google Maps</a>' +
    '<div class="time"><span>' + getTime(timestamp) + '</span></div>';
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function editMessagePrompt(id) {
  if (!id) return;
  editMsgId = id;
  const el = document.getElementById('messages').querySelector('[data-id="' + id + '"]');
  if (!el) return;
  const textEl = el.querySelector('.text');
  const newText = prompt('Edit message:', textEl.textContent);
  if (newText && newText.trim()) {
    connections.forEach(c => { if (c.open) c.send({ type: 'edit', id, text: newText.trim() }); });
    editMessageDOM(id, newText.trim());
  }
  editMsgId = null;
}

function editMessageDOM(id, text) {
  const el = document.getElementById('messages').querySelector('[data-id="' + id + '"]');
  if (el) {
    el.querySelector('.text').innerHTML = linkify(escapeHtml(text));
    el.querySelector('.text').style.fontStyle = 'italic';
  }
}

function deleteMessage(id) {
  connections.forEach(c => { if (c.open) c.send({ type: 'delete', id }); });
  deleteMessageDOM(id);
}

function deleteMessageDOM(id) {
  const el = document.getElementById('messages').querySelector('[data-id="' + id + '"]');
  if (el) el.remove();
}

function replyToMessage(id, sender, text) {
  replyTo = { id, sender, text };
  document.getElementById('reply-preview').textContent = sender + ': ' + text.substring(0,80);
  document.getElementById('reply-bar').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}

function cancelReply() { replyTo = null; document.getElementById('reply-bar').classList.add('hidden'); }

/* ─────────────── REACTIONS ─────────────── */

function reactToMessage(id) {
  const picker = document.createElement('div');
  picker.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);padding:8px;display:flex;gap:6px;z-index:200;border-radius:8px;box-shadow:var(--shadow)';
  const emojis = ['\uD83D\uDC4D','\u2764\uFE0F','\uD83D\uDE02','\uD83D\uDE2E','\uD83D\uDE22','\uD83D\uDD25','\uD83C\uDF89','\uD83D\uDC40','\uD83D\uDE0D','\uD83D\uDE20','\uD83E\uDD10','\uD83D\uDE4F'];
  emojis.forEach(e => {
    const btn = document.createElement('button');
    btn.textContent = e;
    btn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text);font-size:22px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:background 0.15s';
    btn.onmouseenter = () => btn.style.background = 'var(--bg3)';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.onclick = () => { picker.remove(); sendReaction(id, e); };
    picker.appendChild(btn);
  });
  document.body.appendChild(picker);
  setTimeout(() => picker.remove(), 5000);
}

function sendReaction(id, reaction) {
  connections.forEach(c => { if (c.open) c.send({ type: 'reaction', messageId: id, reaction, username }); });
  addReaction(id, reaction, username);
}

function addReaction(id, reaction, sender) {
  const el = document.getElementById('reactions-' + id);
  if (!el) return;
  const span = document.createElement('span');
  span.title = sender; span.textContent = reaction;
  el.appendChild(span);
}

/* ─────────────── SELF-DESTRUCT ─────────────── */

function toggleDestruct() {
  const timers = [0, 5, 10, 30, 60, 300];
  const currentIdx = timers.indexOf(destructTimer);
  const nextIdx = (currentIdx + 1) % timers.length;
  destructTimer = timers[nextIdx];
  const btn = document.getElementById('destruct-toggle');
  if (destructTimer > 0) {
    btn.classList.add('active');
    showToast('Self-destruct: ' + destructTimer + 's');
  } else {
    btn.classList.remove('active');
    showToast('Self-destruct off');
  }
}

function scheduleDestruct(id, seconds) {
  if (seconds <= 0) return;
  setTimeout(() => { try { deleteMessageDOM(id); } catch(e) {} }, seconds * 1000);
}

/* ─────────────── FILE SHARING ─────────────── */

function attachFile() { document.getElementById('file-share').classList.remove('hidden'); }
function closeFileShare() { document.getElementById('file-share').classList.add('hidden'); }

function sendFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const b64 = e.target.result.split(',')[1];
    const msg = { type: 'file', username, fileName: file.name, fileData: b64, fileType: file.type, timestamp: Date.now() };
    connections.forEach(c => { if (c.open) c.send(msg); });
    addFileMessage(username, file.name, b64, file.type, Date.now(), true);
    showToast('File sent: ' + file.name);
    closeFileShare(); event.target.value = '';
  };
  reader.readAsDataURL(file);
}

function downloadFile(data, name, type) {
  const a = document.createElement('a');
  a.href = 'data:' + type + ';base64,' + data; a.download = name; a.click();
}

/* ─────────────── VOICE ─────────────── */

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
      const reader = new FileReader();
      reader.onload = function(e) {
        const b64 = e.target.result.split(',')[1];
        const msg = { type: 'voice-msg', username, audioData: b64, timestamp: Date.now() };
        connections.forEach(c => { if (c.open) c.send(msg); });
        addVoiceMessage(username, b64, Date.now(), true);
      };
      reader.readAsDataURL(blob);
      if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
      voiceStream = null;
    };
  }
}

/* ─────────────── GPS ─────────────── */

function shareLocation() {
  if (!navigator.geolocation) { showToast('GPS not available'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const msg = { type: 'gps', username, lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
    connections.forEach(c => { if (c.open) c.send(msg); });
    addMapMessage(username, pos.coords.latitude, pos.coords.longitude, Date.now(), true);
    showToast('Location shared');
    closeSettings();
  }, () => showToast('GPS access denied'), { enableHighAccuracy: true, timeout: 10000 });
}

/* ─────────────── EMOJI PICKER ─────────────── */

const EMOJIS = ['\uD83D\uDE00','\uD83D\uDE01','\uD83D\uDE02','\uD83E\uDD23','\uD83D\uDE03','\uD83D\uDE04','\uD83D\uDE05','\uD83D\uDE06','\uD83D\uDE09','\uD83D\uDE0A','\uD83D\uDE0B','\uD83D\uDE0E','\uD83D\uDE0D','\uD83E\uDD70','\uD83D\uDE18','\uD83D\uDE1C','\uD83D\uDE1D','\uD83D\uDE12','\uD83D\uDE0F','\uD83D\uDE4A','\uD83D\uDE48','\uD83D\uDE49','\uD83D\uDE4B','\uD83D\uDE4C','\uD83D\uDE4D','\uD83D\uDE4E','\uD83D\uDE4F','\uD83D\uDC4D','\uD83D\uDC4E','\uD83D\uDC4C','\u270B','\uD83E\uDD1B','\uD83E\uDD1C','\uD83D\uDC4F','\uD83D\uDC46','\uD83D\uDC47','\uD83D\uDC48','\uD83D\uDC49','\uD83D\uDC4A','\uD83E\uDD1D','\uD83D\uDCAA','\uD83D\uDC8B','\u2764\uFE0F','\uD83E\uDDE1','\uD83D\uDC9B','\uD83D\uDC9A','\uD83D\uDC99','\uD83D\uDC9C','\uD83D\uDDA4','\uD83D\uDC94','\uD83D\uDC95','\uD83D\uDC96','\uD83D\uDC97','\uD83D\uDC98','\uD83D\uDC9D','\uD83D\uDC93','\uD83D\uDC8E','\u2728','\u2B50','\uD83C\uDF1F','\uD83C\uDF20','\u2600\uFE0F','\uD83C\uDF0D','\uD83C\uDF0A','\uD83D\uDD25','\uD83C\uDF89','\uD83C\uDF88','\uD83C\uDF81','\uD83C\uDF8A','\uD83C\uDF8F','\uD83C\uDF80','\uD83D\uDCBB','\uD83D\uDCF1','\uD83D\uDD10','\uD83D\uDD11','\uD83D\uDCA1','\uD83D\uDCF7','\uD83C\uDFA4','\uD83C\uDFA7','\uD83C\uDFAE','\uD83D\uDD79\uFE0F','\uD83D\uDEE0\uFE0F','\uD83D\uDCE1','\uD83D\uDD14','\u23F0','\uD83E\uDDE0','\uD83D\uDC41\uFE0F','\uD83D\uDDE3\uFE0F','\uD83D\uDCAC','\uD83D\uDDE8\uFE0F','\uD83D\uDCDD','\u2709\uFE0F','\uD83D\uDCE8','\uD83D\uDCE9','\uD83D\uDCEA','\uD83D\uDD17','\uD83E\uDDE9','\uD83C\uDFAF','\uD83C\uDFC6','\u2694\uFE0F','\uD83D\uDEE1\uFE0F','\uD83C\uDF10','\uD83D\uDE80','\uD83D\uDEF8','\u2721\uFE0F','\u2728'];

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

/* ─────────────── STEALTH MODE ─────────────── */

let calcExpr = '0';

function toggleStealth() {
  document.getElementById('chat').classList.toggle('hidden');
  document.getElementById('calculator').classList.toggle('hidden');
}

function calcInput(v) { calcExpr = (calcExpr === '0' ? '' : calcExpr) + v; document.getElementById('calc-display').textContent = calcExpr; }
function calcOp(v) { calcExpr += v; document.getElementById('calc-display').textContent = calcExpr; }
function calcResult() { try { calcExpr = String(eval(calcExpr)); } catch(e) { calcExpr = 'Error'; } document.getElementById('calc-display').textContent = calcExpr; }
function calcClear() { calcExpr = '0'; document.getElementById('calc-display').textContent = '0'; }

/* ─────────────── SEARCH ─────────────── */

function toggleSearch() {
  const bar = document.getElementById('search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) document.getElementById('search-input').focus();
  else clearSearch();
}

function searchMessages(q) {
  const msgs = document.querySelectorAll('#messages .message, #messages .system-msg');
  msgs.forEach(el => {
    const t = el.textContent.toLowerCase();
    el.style.display = (t.includes(q.toLowerCase()) || !q) ? '' : 'none';
  });
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  searchMessages('');
  document.getElementById('search-bar').classList.add('hidden');
}

/* ─────────────── USER LIST ─────────────── */

function showUserList() {
  const c = document.getElementById('user-list-content');
  c.innerHTML = '<div class="user-entry"><span>You (' + username + ')</span></div>';
  Object.keys(peerUserMap).forEach(key => {
    const d = document.createElement('div');
    d.className = 'user-entry';
    d.innerHTML = '<span>' + escapeHtml(peerUserMap[key].username) + '</span>';
    if (isHost) {
      const kick = document.createElement('button');
      kick.textContent = 'Kick'; kick.className = 'btn-sm btn-danger';
      kick.onclick = () => kickUser(key);
      d.appendChild(kick);
    }
    c.appendChild(d);
  });
  document.getElementById('user-list').classList.remove('hidden');
}

function closeUserList() { document.getElementById('user-list').classList.add('hidden'); }

function kickUser(peerId) {
  connections.forEach(c => {
    if (c.peer === peerId || c.peer === 'ghost-' + peerId) {
      c.send({ type: 'kick' });
      c.close();
    }
  });
  showToast('User kicked');
  closeUserList();
}

/* ─────────────── SCREENSHOT DETECTION ─────────────── */

let lastScreenshotAlert = 0;

function screenshotDetect() {
  const now = Date.now();
  if (now - lastScreenshotAlert < 5000) return;
  lastScreenshotAlert = now;
  connections.forEach(c => { if (c.open) c.send({ type: 'screenshot', username, timestamp: now }); });
}

/* ─────────────── QR CODE ─────────────── */

function generateQrCode(code) {
  const container = document.getElementById('qr-container');
  container.classList.remove('hidden');
  container.innerHTML = '<div id="qrcode"></div>';
  qrCodeInstance = new QRCode(document.getElementById('qrcode'), {
    text: 'ghostchat://join/' + code,
    width: 160, height: 160,
    colorDark: '#00a884',
    colorLight: '#ffffff'
  });
}

function showQrScan() {
  document.getElementById('qr-scanner').classList.remove('hidden');
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onQrScanSuccess, onQrScanFailure)
    .catch(() => { showToast('Camera access denied'); closeQrScan(); });
}

function onQrScanSuccess(t) {
  html5QrCode.stop();
  const m = t.match(/ghostchat:\/\/join\/(\w+)/);
  const c = m ? m[1] : t.trim();
  closeQrScan();
  setTimeout(() => joinRoom(c), 300);
}

function onQrScanFailure() {}

function closeQrScan() {
  try { if (html5QrCode) html5QrCode.stop(); } catch(e) {}
  document.getElementById('qr-scanner').classList.add('hidden');
}

/* ─────────────── BLE ─────────────── */

function showBleScan() { document.getElementById('ble-scanner').classList.remove('hidden'); }
function closeBleScan() { document.getElementById('ble-scanner').classList.add('hidden'); }

function startBleScan() {
  if (typeof navigator.bluetooth === 'undefined') { showToast('BLE requires Android APK'); return; }
  navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb'] })
    .then(dev => {
      bleDevice = dev;
      const el = document.getElementById('ble-devices');
      el.innerHTML = '<div class="ble-device"><span class="ble-name">' + escapeHtml(dev.name || 'Unknown') + '</span><span class="ble-connect" onclick="connectBle()">Connect</span></div>';
    })
    .catch(() => { document.getElementById('ble-devices').innerHTML = '<p class="hint">No device selected</p>'; });
}

function connectBle() {
  if (!bleDevice) return;
  bleDevice.gatt.connect().then(server => {
    showToast('BLE connected: ' + bleDevice.name);
    if (roomCode) {
      server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb').then(svc => {
        svc.getCharacteristic('0000ff01-0000-1000-8000-00805f9b34fb').then(ch => {
          const enc = new TextEncoder().encode('JOIN:' + roomCode);
          ch.writeValue(enc);
          showToast('Room code sent via BLE');
        });
      }).catch(() => showToast('BLE service not found'));
    }
  }).catch(() => showToast('BLE connection failed'));
}

/* ─────────────── EXPORT CHAT ─────────────── */

function exportChat() {
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ghost Chat - ' + escapeHtml(roomCode) + '</title>';
  html += '<style>body{background:#111b21;color:#e9edef;font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto}.m{padding:8px 12px;margin:6px 0;border-radius:8px;background:#1f2c33}.s{text-align:center;color:#667781;font-style:italic;font-size:13px}.t{color:#8696a0;font-size:12px}.h{font-size:13px;color:#00a884;font-weight:700}</style></head><body>';
  html += '<h1 style="color:#00a884">Ghost Chat</h1><p style="color:#667781;font-size:14px">Room: ' + escapeHtml(roomCode) + '</p><hr style="border-color:#313d45">';
  document.querySelectorAll('#messages .message, #messages .system-msg').forEach(el => {
    if (el.classList.contains('system-msg')) html += '<p class="s">' + escapeHtml(el.textContent) + '</p>';
    else {
      const sender = el.querySelector('.sender')?.textContent || 'You';
      const text = el.querySelector('.text')?.textContent || '';
      const time = el.querySelector('.time span')?.textContent || '';
      html += '<div class="m"><span class="h">' + escapeHtml(sender) + '</span> ' + escapeHtml(text) + ' <span class="t">' + escapeHtml(time) + '</span></div>';
    }
  });
  html += '</body></html>';
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ghost-chat-' + roomCode + '-' + Date.now() + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Chat exported');
}

/* ─────────────── UNREAD BADGE ─────────────── */

function updateUnreadBadge(n) {
  unreadCount = n;
  const b = document.getElementById('unread-badge');
  if (!b) return;
  if (n > 0) { b.textContent = n; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

/* ─────────────── OFFLINE QUEUE ─────────────── */

function queueOfflineMessage(msg) {
  offlineQueue.push(msg);
  try { localStorage.setItem('ghost-queue-' + roomCode, JSON.stringify(offlineQueue)); } catch(e) {}
}

function flushOfflineQueue() {
  if (offlineQueue.length === 0) return;
  const q = [...offlineQueue];
  offlineQueue = [];
  localStorage.removeItem('ghost-queue-' + roomCode);
  q.forEach(msg => { connections.forEach(c => { if (c.open) c.send(msg); }); });
  showToast('Sent ' + q.length + ' queued messages');
}

/* ─────────────── HISTORY ─────────────── */

function saveHistory() {
  try {
    const recent = messageHistory.slice(-300);
    localStorage.setItem('ghost-msgs-' + roomCode, JSON.stringify(recent));
  } catch(e) {}
}

function loadHistory() {
  try {
    const s = localStorage.getItem('ghost-msgs-' + roomCode);
    if (s) { JSON.parse(s).forEach(m => { if (m.text) addMessage(m.sender, m.text, m.timestamp, m.isOwn, m.id); }); }
  } catch(e) {}
}

/* ─────────────── SETTINGS ─────────────── */

function showSettings() {
  document.getElementById('username-input').value = loadUsername();
  document.getElementById('settings-panel').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-panel').classList.add('hidden'); }

function saveUsername() {
  const n = document.getElementById('username-input').value.trim() || generateUsername();
  username = n;
  localStorage.setItem('ghost-username', n);
  showToast('Username: ' + n);
}

function loadUsername() { return localStorage.getItem('ghost-username') || generateUsername(); }

function clearHistory() {
  messageHistory = [];
  localStorage.removeItem('ghost-msgs-' + roomCode);
  document.getElementById('messages').innerHTML = '';
  addSystemMessage('History cleared');
  showToast('History cleared');
}

/* ─────────────── LOAD PREFERENCES ─────────────── */

function loadPrefs() {
  soundEnabled = localStorage.getItem('ghost-sound') !== '0';
  vibrateEnabled = localStorage.getItem('ghost-vibrate') !== '0';
  const sc = document.getElementById('sound-check');
  const vc = document.getElementById('vibrate-check');
  if (sc) sc.checked = soundEnabled;
  if (vc) vc.checked = vibrateEnabled;
}

/* ─────────────── UI HELPERS ─────────────── */

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

function copyRoomCode() {
  const code = document.getElementById('room-code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => showToast('Copied')).catch(() => showToast('Copy failed'));
}

/* ─────────────── TYPING INDICATOR ─────────────── */

function showTypingIndicator(sender) {
  const el = document.getElementById('typing-indicator');
  if (!el) return;
  document.getElementById('typing-text').textContent = sender + ' is typing...';
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2000);
}

/* ─────────────── NETWORK DETECTION ─────────────── */

let isOnline = navigator.onLine;

function updateNetworkStatus() {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('connection-status-text');
  const modeIndicator = document.getElementById('network-mode');

  if (isOnline) {
    if (dot) dot.classList.add('online');
    if (label && !peer) label.textContent = 'Online — ready to connect';
    if (modeIndicator) modeIndicator.textContent = '\uD83C\uDF10 Cloud';
  } else {
    if (dot) dot.classList.remove('online');
    if (label && !peer) label.textContent = 'Offline — use QR or BLE';
    if (modeIndicator) modeIndicator.textContent = '\uD83D\uDCF4 Local only';
  }
}

function handleOnline() {
  isOnline = true;
  updateNetworkStatus();
  showToast('Network online');
  if (peer && peer.disconnected) {
    peer.reconnect();
    showToast('Reconnecting...');
  }
}

function handleOffline() {
  isOnline = false;
  updateNetworkStatus();
  showToast('Network offline — using local mode');
}

window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateNetworkStatus();
});

/* ─────────────── INIT ─────────────── */

loadTheme();
loadPrefs();
username = loadUsername();
updateNetworkStatus();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeQrScan(); closeBleScan(); closeSettings(); closeFileShare(); closeUserList();
    document.getElementById('search-bar')?.classList.add('hidden');
    document.getElementById('emoji-picker')?.classList.add('hidden');
    cancelReply();
  }
});
