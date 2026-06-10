/* ═══════════════════════════════════════════════════════════════
   GHOST CHAT — P2P Encrypted Messaging App
   All features: QR, BLE, voice, files, stealth, reactions, etc.
   ═══════════════════════════════════════════════════════════════ */

let peer = null, connections = [], myPeerId = null, roomCode = '', isHost = false, username = '';
let qrCodeInstance = null, html5QrCode = null, bleDevice = null;
let typingTimeout = null, messageHistory = [];
let soundEnabled = true, vibrateEnabled = true;
let replyTo = null, destructTimer = 0, editMsgId = null;
let roomLocked = false, roomPassword = '', isStealth = false;
let unreadCount = 0, isFocused = true;
let mediaRecorder = null, audioChunks = [], voiceStream = null;
let peerUserMap = {};
let offlineQueue = [];

window.addEventListener('focus', () => { isFocused = true; updateUnreadBadge(0); });
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
  const a = ['ghost','shadow','phantom','void','null','dark','cyber','neon','matrix','zero','echo','flux','cipher','hex'];
  const b = ['walker','hacker','drift','echo','flux','shift','pulse','raven','viper','node','core','blade','spirit'];
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
  const body = document.body, btn = document.getElementById('theme-btn');
  const dark = body.getAttribute('data-theme') !== 'light';
  body.setAttribute('data-theme', dark ? 'light' : 'dark');
  btn.textContent = dark ? '[ dark mode ]' : '[ light mode ]';
  localStorage.setItem('ghost-theme', dark ? 'light' : 'dark');
}

function loadTheme() {
  const s = localStorage.getItem('ghost-theme');
  if (s) document.body.setAttribute('data-theme', s);
  const f = localStorage.getItem('ghost-font');
  if (f) { document.body.setAttribute('data-font', f); const sel = document.getElementById('font-size-select'); if (sel) sel.value = f; }
}

function setFontSize(s) {
  document.body.setAttribute('data-font', s);
  localStorage.setItem('ghost-font', s);
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
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
  } catch(e) {}
}

function vibrateDevice() {
  if (vibrateEnabled && navigator.vibrate) navigator.vibrate(100);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-btn').textContent = soundEnabled ? '[ on ]' : '[ off ]';
  localStorage.setItem('ghost-sound', soundEnabled ? '1' : '0');
}

function toggleVibrate() {
  vibrateEnabled = !vibrateEnabled;
  document.getElementById('vibrate-btn').textContent = vibrateEnabled ? '[ on ]' : '[ off ]';
  localStorage.setItem('ghost-vibrate', vibrateEnabled ? '1' : '0');
}

/* ─────────────── ROOM LOGIC ─────────────── */

function createRoom() {
  username = loadUsername();
  roomCode = generateCode();
  roomPassword = document.getElementById('room-password').value.trim();
  isHost = true;
  if (roomPassword) document.getElementById('room-pw-notice').classList.remove('hidden');
  connectPeer(roomCode, true);
}

function joinRoom(code) {
  username = loadUsername();
  const input = document.getElementById('room-input');
  const pw = document.getElementById('room-password').value.trim();
  code = code || input.value.trim().toUpperCase();
  if (code.length < 3) { showToast('enter a valid room code'); return; }
  roomCode = code; roomPassword = pw; isHost = false;
  input.value = '';
  connectPeer(roomCode, false);
}

function connectPeer(code, host) {
  showStatus('connecting to ghost network...');
  const pid = host ? 'ghost-' + code : undefined;
  peer = new Peer(pid, {
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]}, debug: 0
  });
  peer.on('open', id => {
    myPeerId = id;
    if (host) {
      document.getElementById('room-display').classList.remove('hidden');
      document.getElementById('room-code').textContent = code;
      generateQrCode(code);
      showStatus('');
      enterChat();
      if (roomPassword) document.getElementById('host-panel').classList.remove('hidden');
    } else {
      const conn = peer.connect('ghost-' + code, { reliable: true });
      setupConnection(conn, false);
      showStatus('');
      enterChat();
    }
    flushOfflineQueue();
  });
  peer.on('connection', conn => { if (isHost) setupConnection(conn, true); });
  peer.on('disconnected', () => { showToast('connection lost. reconnecting...'); peer.reconnect(); });
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') { showToast('room not found'); leaveRoom(); }
    else if (err.type !== 'disconnected') showToast('error: ' + err.type);
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
    if (data.type === 'auth-denied') { showToast('wrong password'); leaveRoom(); return; }
    handleData(data, conn);
  });
  conn.on('close', () => {
    connections = connections.filter(c => c !== conn);
    addSystemMessage('a peer disconnected');
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
    case 'user-join':
      addSystemMessage(data.username + ' joined');
      peerUserMap[data.peerId] = { username: data.username, conn };
      if (isHost) broadcastToPeers({ type: 'peer-joined', username: data.username, peerId: data.peerId }, conn);
      updatePeerCount();
      break;
    case 'welcome': addSystemMessage('connected to room: ' + data.roomCode); break;
    case 'peer-joined':
      addSystemMessage(data.username + ' joined');
      peerUserMap[data.peerId] = { username: data.username };
      updatePeerCount();
      break;
    case 'file':
      addFileMessage(data.username, data.fileName, data.fileData, data.fileType, data.timestamp, false);
      if (!isFocused) { unreadCount++; updateUnreadBadge(unreadCount); }
      playNotification(); vibrateDevice();
      break;
    case 'typing': showTypingIndicator(data.username); break;
    case 'reaction': addReaction(data.messageId, data.reaction, data.username); break;
    case 'edit': editMessageDOM(data.id, data.text); break;
    case 'delete': deleteMessageDOM(data.id); break;
    case 'voice-msg': addVoiceMessage(data.username, data.audioData, data.timestamp, false); playNotification(); break;
    case 'screenshot': addSystemMessage('⚠ ' + data.username + ' may have taken a screenshot'); break;
    case 'gps': addMapMessage(data.username, data.lat, data.lng, data.timestamp, false); break;
    case 'kick': showToast('you were removed from the room'); leaveRoom(); break;
    case 'room-locked': addSystemMessage('room locked by host'); roomLocked = true; break;
    case 'relay': broadcastToPeers(data.message, conn); break;
  }
}

function broadcastToPeers(msg, exclude) {
  connections.forEach(c => { if (c !== exclude && c.open) c.send(msg); });
}

function enterChat() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('chat').classList.remove('hidden');
  document.getElementById('room-name').textContent = roomCode;
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('chat-input').addEventListener('input', () => {
    clearTimeout(typingTimeout);
    connections.forEach(c => { if (c.open) c.send({ type: 'typing', username }); });
    typingTimeout = setTimeout(() => {}, 1000);
  });
  loadHistory();
  addSystemMessage(isHost ? 'room created. code: ' + roomCode : 'connecting to: ' + roomCode);
}

function leaveRoom() {
  if (peer) { peer.destroy(); peer = null; }
  connections = []; isHost = false; roomLocked = false; peerUserMap = {};
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('chat').classList.add('hidden');
  document.getElementById('messages').innerHTML = '';
  document.getElementById('room-display').classList.add('hidden');
  document.getElementById('connection-status').classList.add('hidden');
  document.getElementById('qr-container').classList.add('hidden');
  document.getElementById('host-panel').classList.add('hidden');
  document.getElementById('room-pw-notice').classList.add('hidden');
  document.getElementById('self-destruct-bar').classList.add('hidden');
  if (qrCodeInstance) { qrCodeInstance.clear(); qrCodeInstance = null; }
  closeQrScan(); closeBleScan(); closeSettings(); closeFileShare(); closeUserList();
  if (isStealth) toggleStealth();
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
  d.className = 'message' + (isOwn ? ' own' : '');
  d.dataset.id = id || uuid();
  let html = '';
  if (replyToData) html += '<div class="reply-quote">↳ ' + escapeHtml(replyToData.sender) + ': ' + escapeHtml(replyToData.text.substring(0,50)) + '</div>';
  html += '<div class="sender">>> ' + escapeHtml(sender) + '</div>' +
    '<div class="text">' + linkify(escapeHtml(text)) + '</div>' +
    '<div class="time">' + getTime(timestamp) + '</div>' +
    '<div class="msg-actions">' +
    (isOwn ? '<button onclick="editMessagePrompt(\'' + (id||'') + '\')">[edit]</button><button onclick="deleteMessage(\'' + (id||'') + '\')">[del]</button>' : '') +
    '<button onclick="replyToMessage(\'' + (id||'') + '\',\'' + escapeHtml(sender) + '\',\'' + escapeHtml(text.substring(0,80)) + '\')">[reply]</button>' +
    '<button onclick="reactToMessage(\'' + (id||'') + '\')">[react]</button></div>' +
    '<div class="reactions" id="reactions-' + (id||'') + '"></div>';
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
  messageHistory.push({ sender, text, timestamp, isOwn, id: id||uuid() });
  saveHistory();
}

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--cyan)">$1</a>');
}

function addSystemMessage(text) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'system-msg'; d.textContent = '*** ' + text + ' ***';
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addFileMessage(sender, fileName, fileData, fileType, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message' + (isOwn ? ' own' : '');
  const ext = fileName.split('.').pop().toLowerCase();
  const isImg = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  let content = '<div class="sender">>> ' + escapeHtml(sender) + ' [file]</div>';
  if (isImg && fileData) content += '<img src="data:' + fileType + ';base64,' + fileData + '" onclick="window.open(this.src)" style="max-width:180px;border-radius:4px;margin:2px 0;display:block">';
  else content += '<div class="file-msg" onclick="downloadFile(\'' + fileData + '\',\'' + escapeHtml(fileName) + '\',\'' + fileType + '\')">[ 📎 ' + escapeHtml(fileName) + ' ]</div>';
  content += '<div class="time">' + getTime(timestamp) + '</div>';
  d.innerHTML = content; c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addVoiceMessage(sender, audioData, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message' + (isOwn ? ' own' : '');
  d.innerHTML = '<div class="sender">>> ' + escapeHtml(sender) + ' [voice]</div>' +
    '<audio controls src="data:audio/webm;base64,' + audioData + '" style="width:100%;max-width:200px;height:36px"></audio>' +
    '<div class="time">' + getTime(timestamp) + '</div>';
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addMapMessage(sender, lat, lng, timestamp, isOwn) {
  const c = document.getElementById('messages');
  const d = document.createElement('div');
  d.className = 'message' + (isOwn ? ' own' : '');
  d.innerHTML = '<div class="sender">>> ' + escapeHtml(sender) + ' [location]</div>' +
    '<div style="font-size:0.65rem">📍 ' + lat + ', ' + lng + '</div>' +
    '<a href="https://www.google.com/maps?q=' + lat + ',' + lng + '" target="_blank" style="color:var(--cyan);font-size:0.65rem">[ open in maps ]</a>' +
    '<div class="time">' + getTime(timestamp) + '</div>';
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function editMessagePrompt(id) {
  if (!id) return;
  editMsgId = id;
  const msgs = document.getElementById('messages');
  const el = msgs.querySelector('[data-id="' + id + '"]');
  if (!el) return;
  const textEl = el.querySelector('.text');
  const newText = prompt('edit message:', textEl.textContent);
  if (newText && newText.trim()) {
    connections.forEach(c => { if (c.open) c.send({ type: 'edit', id, text: newText.trim() }); });
    editMessageDOM(id, newText.trim());
  }
  editMsgId = null;
}

function editMessageDOM(id, text) {
  const el = document.getElementById('messages').querySelector('[data-id="' + id + '"]');
  if (el) { el.querySelector('.text').innerHTML = linkify(escapeHtml(text)); el.querySelector('.text').style.fontStyle = 'italic'; }
}

function deleteMessage(id, skipNotify) {
  if (!skipNotify) connections.forEach(c => { if (c.open) c.send({ type: 'delete', id }); });
  deleteMessageDOM(id);
}

function deleteMessageDOM(id) {
  const el = document.getElementById('messages').querySelector('[data-id="' + id + '"]');
  if (el) el.remove();
}

function replyToMessage(id, sender, text) {
  replyTo = { id, sender, text };
  document.getElementById('reply-preview').textContent = '↳ ' + sender + ': ' + text.substring(0,50);
  document.getElementById('reply-bar').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}

function cancelReply() { replyTo = null; document.getElementById('reply-bar').classList.add('hidden'); }

/* ─────────────── REACTIONS ─────────────── */

function reactToMessage(id) {
  const picker = document.createElement('div');
  picker.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);padding:8px;display:flex;gap:6px;z-index:200;border-radius:4px';
  const emojis = ['👍','❤️','😂','😮','😢','🔥','🎉','👀'];
  emojis.forEach(e => {
    const btn = document.createElement('button');
    btn.textContent = e; btn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text);font-size:1.2rem;cursor:pointer;padding:4px 8px;border-radius:2px';
    btn.onclick = () => { picker.remove(); sendReaction(id, e); };
    picker.appendChild(btn);
  });
  document.body.appendChild(picker);
  setTimeout(() => picker.remove(), 5000);
  picker.onclick = e => { if (e.target === picker) picker.remove(); };
}

function sendReaction(id, reaction) {
  connections.forEach(c => { if (c.open) c.send({ type: 'reaction', messageId: id, reaction, username }); });
  addReaction(id, reaction, username);
}

function addReaction(id, reaction, sender) {
  const el = document.getElementById('reactions-' + id);
  if (!el) return;
  const span = document.createElement('span');
  span.title = sender; span.textContent = reaction; span.style.cssText = 'cursor:default';
  el.appendChild(span);
}

/* ─────────────── SELF-DESTRUCT ─────────────── */

function setDestructTimer(val) {
  destructTimer = parseInt(val);
}

function scheduleDestruct(id, seconds) {
  if (seconds <= 0) return;
  setTimeout(() => { try { deleteMessage(id, true); } catch(e) {} }, seconds * 1000);
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
    showToast('file sent: ' + file.name);
    closeFileShare(); event.target.value = '';
  };
  reader.readAsDataURL(file);
}

function downloadFile(data, name, type) {
  const a = document.createElement('a');
  a.href = 'data:' + type + ';base64,' + data; a.download = name; a.click();
}

/* ─────────────── VOICE / PUSH-TO-TALK ─────────────── */

async function startVoiceStream() {
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(voiceStream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start();
  } catch(e) { showToast('mic access denied'); }
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

/* ─────────────── GPS LOCATION ─────────────── */

function shareLocation() {
  if (!navigator.geolocation) { showToast('GPS not available'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const msg = { type: 'gps', username, lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
    connections.forEach(c => { if (c.open) c.send(msg); });
    addMapMessage(username, pos.coords.latitude, pos.coords.longitude, Date.now(), true);
    showToast('location shared');
  }, () => showToast('GPS access denied'), { enableHighAccuracy: true, timeout: 10000 });
}

/* ─────────────── EMOJI PICKER ─────────────── */

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😜','😝','😤','😠','😡','🤬','😈','👿','💀','☠️','👻','👽','🤖','💩','👍','👎','👊','✊','🤛','🤜','👏','🙌','🔥','💯','❤️','🧡','💛','💚','💙','💜','🖤','💔','💘','💝','💀','⚡','🌙','⭐','🌊','🔥','🎉','🎊','🎈','💎','🔮','🌐','☕','🍕','🍺','🍻','💻','📱','🔒','🔑','💡','📷','🎤','🎧','🎮','🕹️','📡','🔔','⏰','🧠','👁️','🗣️','💬','🗨️','📝','✉️','📨','📩','🔗','🧩','🎯','🏆','⚔️','🛡️','🌐','🚀','🛸','💫','✨'];

function toggleEmojiPicker() {
  const p = document.getElementById('emoji-picker');
  if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
  p.classList.remove('hidden');
  if (p.children.length === 0) {
    EMOJIS.forEach(e => {
      const b = document.createElement('button');
      b.textContent = e;
      b.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text);font-size:1.1rem;cursor:pointer;padding:4px;border-radius:2px;line-height:1';
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
  isStealth = !isStealth;
  document.getElementById('chat').classList.toggle('hidden');
  document.getElementById('calculator').classList.toggle('hidden');
}

function calcInput(v) { calcExpr = (calcExpr === '0' ? '' : calcExpr) + v; document.getElementById('calc-display').textContent = calcExpr; }
function calcOp(v) { calcExpr += v; document.getElementById('calc-display').textContent = calcExpr; }
function calcResult() { try { calcExpr = String(eval(calcExpr)); } catch(e) { calcExpr = 'error'; } document.getElementById('calc-display').textContent = calcExpr; }
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

function clearSearch() { document.getElementById('search-input').value = ''; searchMessages(''); }

/* ─────────────── USER LIST ─────────────── */

function showUserList() {
  const c = document.getElementById('user-list-content');
  c.innerHTML = '';
  const me = document.createElement('div');
  me.className = 'system-msg'; me.textContent = 'you (' + username + ')';
  c.appendChild(me);
  Object.keys(peerUserMap).forEach(key => {
    const d = document.createElement('div');
    d.className = 'system-msg';
    d.textContent = peerUserMap[key].username;
    if (isHost) {
      const kick = document.createElement('button');
      kick.textContent = ' [kick]'; kick.className = 'btn btn-small btn-danger';
      kick.style.cssText = 'margin-left:8px;font-size:0.6rem;padding:2px 6px';
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
  showToast('user kicked');
  closeUserList();
}

/* ─────────────── HOST CONTROLS ─────────────── */

function lockRoom() {
  roomLocked = true;
  broadcastToPeers({ type: 'room-locked' });
  showToast('room locked');
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
    width: 170, height: 170,
    colorDark: getComputedStyle(document.body).getPropertyValue('--green').trim() || '#00ff41',
    colorLight: getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#0a0a0a'
  });
}

function showQrScan() {
  document.getElementById('qr-scanner').classList.remove('hidden');
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
  html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onQrScanSuccess, onQrScanFailure)
    .catch(() => { showToast('camera access denied'); closeQrScan(); });
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

function showBleScan() {
  document.getElementById('ble-scanner').classList.remove('hidden');
  document.getElementById('ble-devices').innerHTML = '<p class="text-dim">scanning...</p>';
}

function closeBleScan() { document.getElementById('ble-scanner').classList.add('hidden'); }

function startBleScan() {
  if (typeof navigator.bluetooth === 'undefined') { showToast('BLE requires Android APK'); return; }
  navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb'] })
    .then(dev => {
      bleDevice = dev;
      const el = document.getElementById('ble-devices');
      el.innerHTML = '<div class="ble-device"><span class="ble-name">' + escapeHtml(dev.name || 'Unknown') + '</span><span class="ble-connect" onclick="connectBle()">[ connect ]</span></div>';
    })
    .catch(() => { document.getElementById('ble-devices').innerHTML = '<p class="text-dim">scan cancelled or error</p>'; });
}

function connectBle() {
  if (!bleDevice) return;
  bleDevice.gatt.connect().then(server => {
    showToast('BLE connected: ' + bleDevice.name);
    sendRoomCodeViaBle(server);
  }).catch(() => showToast('BLE connection failed'));
}

function sendRoomCodeViaBle(server) {
  if (roomCode) {
    server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb').then(svc => {
      svc.getCharacteristic('0000ff01-0000-1000-8000-00805f9b34fb').then(ch => {
        const enc = new TextEncoder().encode('JOIN:' + roomCode);
        ch.writeValue(enc);
        showToast('room code sent via BLE');
      });
    }).catch(() => showToast('BLE service not found on device'));
  }
}

/* ─────────────── EXPORT CHAT ─────────────── */

function exportChat() {
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ghost Chat - ' + escapeHtml(roomCode) + '</title>';
  html += '<style>body{background:#0a0a0a;color:#00ff41;font-family:monospace;padding:20px}.m{margin:10px 0}.s{color:#555;font-style:italic}.t{color:#888;font-size:0.8rem}</style></head><body>';
  html += '<h1>Ghost Chat — ' + escapeHtml(roomCode) + '</h1><hr>';
  document.querySelectorAll('#messages .message, #messages .system-msg').forEach(el => {
    if (el.classList.contains('system-msg')) html += '<p class="s">' + escapeHtml(el.textContent) + '</p>';
    else {
      const sender = el.querySelector('.sender')?.textContent || '';
      const text = el.querySelector('.text')?.textContent || '';
      const time = el.querySelector('.time')?.textContent || '';
      html += '<div class="m"><b>' + escapeHtml(sender) + '</b> ' + escapeHtml(text) + ' <span class="t">' + escapeHtml(time) + '</span></div>';
    }
  });
  html += '</body></html>';
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ghost-chat-' + roomCode + '-' + Date.now() + '.html';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('chat exported');
}

/* ─────────────── UNREAD BADGE ─────────────── */

function updateUnreadBadge(n) {
  unreadCount = n;
  const b = document.getElementById('unread-badge');
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
  showToast('sent ' + q.length + ' queued messages');
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
    if (s) {
      const msgs = JSON.parse(s);
      msgs.forEach(m => { if (m.text) addMessage(m.sender, m.text, m.timestamp, m.isOwn, m.id); });
    }
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
  showToast('username: ' + n);
}

function loadUsername() { return localStorage.getItem('ghost-username') || generateUsername(); }

function clearHistory() {
  messageHistory = [];
  localStorage.removeItem('ghost-msgs-' + roomCode);
  document.getElementById('messages').innerHTML = '';
  addSystemMessage('history cleared');
  showToast('history cleared');
}

/* ─────────────── LOAD SAVED PREFERENCES ─────────────── */

function loadPrefs() {
  soundEnabled = localStorage.getItem('ghost-sound') !== '0';
  vibrateEnabled = localStorage.getItem('ghost-vibrate') !== '0';
  const sb = document.getElementById('sound-btn');
  const vb = document.getElementById('vibrate-btn');
  if (sb) sb.textContent = soundEnabled ? '[ on ]' : '[ off ]';
  if (vb) vb.textContent = vibrateEnabled ? '[ on ]' : '[ off ]';
}

/* ─────────────── UI HELPERS ─────────────── */

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

function showStatus(msg) {
  const el = document.getElementById('connection-status');
  if (msg) { el.querySelector('span:last-child').textContent = msg; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function copyRoomCode() {
  const code = document.getElementById('room-code').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('copied')).catch(() => showToast('copy failed'));
}

/* ─────────────── TYPING INDICATOR ─────────────── */

function showTypingIndicator(sender) {
  const el = document.getElementById('typing-indicator');
  el.textContent = sender + ' is typing...';
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2000);
}

/* ─────────────── INIT ─────────────── */

loadTheme();
loadPrefs();
username = loadUsername();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeQrScan(); closeBleScan(); closeSettings(); closeFileShare(); closeUserList();
    document.getElementById('emoji-picker')?.classList.add('hidden');
  }
});
