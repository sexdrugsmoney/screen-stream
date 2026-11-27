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

console.log(`[${new Date().toLocaleTimeString()}] 🚀 Server başlıyor... Port: ${PORT}`);

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send(HTML);
});

app.get('/api/streamers', (req, res) => {
  const list = Array.from(streamers.values()).map(s => ({
    id: s.id,
    hostname: s.hostname,
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
    const streamer = { id: streamerId, hostname: 'Unknown', ws: ws, lastUpdate: Date.now() };
    streamers.set(streamerId, streamer);
    console.log(`✅ Streamer: ${streamerId}`);

    broadcastToAdmins({ type: 'streamer_connected', streamerId, totalStreamers: streamers.size });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'screenshot') {
          streamer.hostname = msg.hostname || 'Unknown';
          streamer.lastUpdate = Date.now();
          broadcastToAdmins({ type: 'screenshot', streamerId, hostname: msg.hostname, data: msg.data, timestamp: msg.timestamp });
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      streamers.delete(streamerId);
      console.log(`❌ Streamer: ${streamerId}`);
      broadcastToAdmins({ type: 'streamer_disconnected', streamerId, totalStreamers: streamers.size });
    });

  } else if (mode === 'admin') {
    adminViewers.add(ws);
    console.log(`👁️ Admin connected (${adminViewers.size})`);

    const streamersList = Array.from(streamers.values()).map(s => ({ id: s.id, hostname: s.hostname, lastUpdate: s.lastUpdate }));
    ws.send(JSON.stringify({ type: 'initial_state', streamers: streamersList }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'send_message') {
          const targetStreamer = streamers.get(msg.streamerId);
          if (targetStreamer && targetStreamer.ws.readyState === WebSocket.OPEN) {
            targetStreamer.ws.send(JSON.stringify({ type: 'admin_message', message: msg.message }));
            console.log(`💬 Message sent: "${msg.message}"`);
          }
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      adminViewers.delete(ws);
      console.log(`Admin disconnected`);
    });
  }
});

function broadcastToAdmins(message) {
  const data = JSON.stringify(message);
  adminViewers.forEach(admin => {
    if (admin.readyState === WebSocket.OPEN) admin.send(data);
  });
}

server.listen(PORT, () => {
  console.log(`✨ http://localhost:${PORT}`);
});

const HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🎥 Screen Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-family: 'Inter', sans-serif; min-height: 100vh; }
    .container { display: flex; height: 100vh; }
    .sidebar { width: 300px; background: rgba(10, 20, 50, 0.95); border-right: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; }
    .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .logo { font-size: 20px; font-weight: bold; margin-bottom: 15px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .stat { background: rgba(102,126,234,0.2); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid rgba(102,126,234,0.3); }
    .stat-value { font-size: 20px; font-weight: bold; color: #667eea; }
    .stat-label { font-size: 11px; opacity: 0.6; margin-top: 3px; }
    .streamer-list { flex: 1; overflow-y: auto; padding: 10px; }
    .streamer-item { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.3s; }
    .streamer-item:hover { background: rgba(102,126,234,0.2); border-color: rgba(102,126,234,0.5); }
    .streamer-item.active { background: linear-gradient(135deg, rgba(102,126,234,0.3), rgba(118,75,162,0.3)); border-color: #667eea; box-shadow: 0 0 20px rgba(102,126,234,0.4); }
    .streamer-name { font-weight: 600; font-size: 14px; margin-bottom: 5px; display: flex; gap: 8px; align-items: center; }
    .dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .streamer-time { font-size: 11px; opacity: 0.5; }
    .main { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 15px; }
    .header { background: rgba(10,20,50,0.6); padding: 15px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
    .video-area { flex: 1; background: #000; border-radius: 12px; display: flex; justify-content: center; align-items: center; overflow: hidden; }
    #screenshot { max-width: 100%; max-height: 100%; }
    .empty { text-align: center; opacity: 0.5; }
    .input-area { display: flex; gap: 10px; }
    input { flex: 1; padding: 10px; border: 1px solid rgba(102,126,234,0.3); background: rgba(102,126,234,0.1); color: white; border-radius: 8px; outline: none; }
    input::placeholder { color: rgba(255,255,255,0.5); }
    button { padding: 10px 20px; background: #667eea; border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    button:hover { background: #764ba2; transform: scale(1.05); }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: rgba(102,126,234,0.3); border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="logo">🎥 ScreenMonitor</div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="activeCount">0</div>
            <div class="stat-label">Active</div>
          </div>
          <div class="stat">
            <div class="stat-value">1</div>
            <div class="stat-label">You</div>
          </div>
        </div>
      </div>
      <div class="streamer-list" id="list">
        <div class="empty">📡 Waiting...</div>
      </div>
    </div>

    <div class="main">
      <div class="header">
        <div id="title" style="font-size: 18px; font-weight: bold;">Select a device</div>
        <div style="font-size: 12px; opacity: 0.6;" id="status">Ready</div>
      </div>

      <div class="video-area" id="videoArea">
        <div class="empty">👈 Select a device to start</div>
      </div>

      <div class="input-area" id="inputArea" style="display: none;">
        <input type="text" id="messageInput" placeholder="Type message..." />
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>

  <script>
    const AUTH_TOKEN = "screen-stream-secret-123";
    let ws = null;
    let streamers = new Map();
    let selectedId = null;
    let frameCount = 0;
    let lastFpsTime = Date.now();

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/?token=\${AUTH_TOKEN}&mode=admin\`);

      ws.onopen = () => {
        document.getElementById("status").textContent = "Connected";
        document.getElementById("status").style.color = "#4ade80";
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "initial_state") {
            msg.streamers.forEach(s => streamers.set(s.id, s));
            updateList();
          } else if (msg.type === "streamer_connected") {
            fetch('/api/streamers').then(r => r.json()).then(data => {
              streamers.clear();
              data.streamers.forEach(s => streamers.set(s.id, s));
              updateList();
              document.getElementById("activeCount").textContent = data.streamers.length;
            });
          } else if (msg.type === "streamer_disconnected") {
            streamers.delete(msg.streamerId);
            if (selectedId === msg.streamerId) { selectedId = null; clearScreen(); }
            updateList();
            document.getElementById("activeCount").textContent = msg.totalStreamers;
          } else if (msg.type === "screenshot" && msg.streamerId === selectedId) {
            let img = document.getElementById("screenshot");
            if (!img) {
              document.getElementById("videoArea").innerHTML = '';
              img = document.createElement("img");
              img.id = "screenshot";
              document.getElementById("videoArea").appendChild(img);
            }
            img.src = msg.data;
            frameCount++;
            const now = Date.now();
            if (now - lastFpsTime >= 1000) {
              frameCount = 0;
              lastFpsTime = now;
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        document.getElementById("status").textContent = "Error";
        document.getElementById("status").style.color = "#ef4444";
      };

      ws.onclose = () => {
        document.getElementById("status").textContent = "Disconnected";
        document.getElementById("status").style.color = "#f97316";
        setTimeout(connect, 3000);
      };
    }

    function updateList() {
      const list = document.getElementById("list");
      if (streamers.size === 0) {
        list.innerHTML = '<div class="empty">📡 Waiting...</div>';
        return;
      }
      list.innerHTML = '';
      streamers.forEach(s => {
        const item = document.createElement('div');
        item.className = 'streamer-item' + (selectedId === s.id ? ' active' : '');
        item.innerHTML = \`
          <div class="streamer-name"><div class="dot"></div>\${s.hostname}</div>
          <div class="streamer-time">\${new Date(s.lastUpdate).toLocaleTimeString()}</div>
        \`;
        item.onclick = () => selectStreamer(s.id, s.hostname);
        list.appendChild(item);
      });
    }

    function selectStreamer(id, hostname) {
      selectedId = id;
      document.getElementById("title").textContent = \`🔴 \${hostname}\`;
      document.getElementById("inputArea").style.display = 'flex';
      clearScreen();
      updateList();
    }

    function clearScreen() {
      document.getElementById("videoArea").innerHTML = '<div class="empty">👁️ Waiting for stream...</div>';
      frameCount = 0;
    }

    function sendMessage() {
      const msg = document.getElementById("messageInput").value;
      if (!msg || !selectedId) return;

      ws.send(JSON.stringify({
        type: 'send_message',
        streamerId: selectedId,
        message: msg
      }));

      document.getElementById("messageInput").value = '';
    }

    document.getElementById("messageInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    connect();
  </script>
</body>
</html>`;
