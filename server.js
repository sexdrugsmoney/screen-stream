const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const AUTH_TOKEN = process.env.AUTH_TOKEN || "screen-stream-secret-123";
const PORT = process.env.PORT || 3000;

// Store screenshot
let latestScreenshot = null;
const wsClients = new Set();

console.log(`[${new Date().toLocaleTimeString()}] Server başlıyor...`);
console.log(`[${new Date().toLocaleTimeString()}] Port: ${PORT}`);
console.log(`[${new Date().toLocaleTimeString()}] Auth Token: ${AUTH_TOKEN}`);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// Dashboard
app.get('/', (req, res) => {
  res.send(DASHBOARD_HTML);
});

// WebSocket
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token !== AUTH_TOKEN) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  console.log(`[${new Date().toLocaleTimeString()}] ✓ Client bağlandı (${wss.clients.size} total)`);
  wsClients.add(ws);

  // Yeni client'a latest screenshot gönder
  if (latestScreenshot) {
    ws.send(JSON.stringify({
      type: 'screenshot',
      data: latestScreenshot.data,
      timestamp: latestScreenshot.timestamp
    }));
  }

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[${new Date().toLocaleTimeString()}] ✗ Client ayrıldı (${wss.clients.size} remaining)`);
  });

  ws.on('error', (error) => {
    console.error(`[${new Date().toLocaleTimeString()}] WebSocket error:`, error.message);
  });
});

// Screenshot upload endpoint
app.post('/upload', (req, res) => {
  const auth = req.headers.authorization;

  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { screenshot, timestamp, hostname } = req.body;

    if (!screenshot) {
      return res.status(400).json({ error: 'Missing screenshot' });
    }

    // Store latest
    latestScreenshot = {
      data: screenshot,
      timestamp: timestamp || Date.now()
    };

    // Broadcast to all WebSocket clients
    const msg = JSON.stringify({
      type: 'screenshot',
      data: screenshot,
      timestamp: timestamp,
      hostname: hostname
    });

    wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });

    console.log(`[${new Date().toLocaleTimeString()}] Screenshot received from ${hostname || 'unknown'}`);
    res.json({ ok: true, clients: wsClients.size });

  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Upload error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: wsClients.size,
    hasScreenshot: !!latestScreenshot
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`[${new Date().toLocaleTimeString()}] ✓ Server çalışıyor: http://localhost:${PORT}`);
  console.log(`[${new Date().toLocaleTimeString()}] Dashboard: http://localhost:${PORT}`);
});

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔴 Canlı Ekran İzlemesi</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: #0a0e27;
      color: #fff;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      overflow: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      padding: 10px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px;
      background: linear-gradient(135deg, #1e1f3a 0%, #2d2e4a 100%);
      border-radius: 8px;
      margin-bottom: 10px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
    }

    .title {
      font-size: 24px;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 15px;
      background: rgba(255, 0, 0, 0.1);
      border: 1px solid #ff4444;
      border-radius: 20px;
      font-size: 14px;
    }

    .status.connected {
      background: rgba(0, 255, 0, 0.1);
      border-color: #44ff44;
      color: #44ff44;
    }

    .status::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .video-container {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.7);
      position: relative;
    }

    #screenshot {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .info {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 12px;
      border-radius: 5px;
      font-size: 12px;
      display: flex;
      gap: 15px;
    }

    .fps, .size, .hostname {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .label {
      opacity: 0.7;
      font-size: 10px;
    }

    .no-stream {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 20px;
      color: #888;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #ff4444;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">
        <span style="color: #ff4444;">🔴</span> Canlı Ekran İzlemesi
      </div>
      <div class="status" id="status">
        Bağlantı Sağlanıyor...
      </div>
    </div>

    <div class="video-container" id="videoContainer">
      <div class="no-stream">
        <div class="spinner"></div>
        <div>Ekran akışı bekleniyor...</div>
      </div>
    </div>

    <div class="info" id="info" style="display: none;">
      <div class="fps">
        <div class="label">FPS</div>
        <div id="fps">0</div>
      </div>
      <div class="size">
        <div class="label">Boyut</div>
        <div id="size">-</div>
      </div>
      <div class="hostname">
        <div class="label">Host</div>
        <div id="hostname">-</div>
      </div>
    </div>
  </div>

  <script>
    const AUTH_TOKEN = "screen-stream-secret-123";
    const statusEl = document.getElementById("status");
    const videoContainer = document.getElementById("videoContainer");
    const infoEl = document.getElementById("info");
    const fpsEl = document.getElementById("fps");
    const sizeEl = document.getElementById("size");
    const hostnameEl = document.getElementById("hostname");

    let ws = null;
    let frameCount = 0;
    let lastTime = Date.now();

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = \`\${protocol}//\${window.location.host}/ws?token=\${AUTH_TOKEN}\`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✓ Bağlantı başarılı");
        statusEl.textContent = "Bağlı";
        statusEl.classList.add("connected");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "screenshot") {
            displayScreenshot(msg.data, msg.hostname);
            frameCount++;

            const now = Date.now();
            const elapsed = now - lastTime;
            if (elapsed >= 1000) {
              const fps = Math.round((frameCount * 1000) / elapsed);
              fpsEl.textContent = fps;
              frameCount = 0;
              lastTime = now;
            }
          }
        } catch (e) {
          console.error("Error parsing message:", e);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        statusEl.textContent = "Hata";
        statusEl.classList.remove("connected");
      };

      ws.onclose = () => {
        console.log("WebSocket kapalı, 3 saniyede yeniden deneniyor...");
        statusEl.textContent = "Bağlantı Kesildi";
        statusEl.classList.remove("connected");
        setTimeout(connect, 3000);
      };
    }

    function displayScreenshot(dataUrl, hostname) {
      let img = document.getElementById("screenshot");

      if (!img) {
        img = document.createElement("img");
        img.id = "screenshot";
        videoContainer.innerHTML = "";
        videoContainer.appendChild(img);
        infoEl.style.display = "flex";
      }

      img.onload = () => {
        sizeEl.textContent = \`\${img.naturalWidth}x\${img.naturalHeight}\`;
      };

      if (hostname) {
        hostnameEl.textContent = hostname;
      }

      img.src = dataUrl;
    }

    connect();

    window.addEventListener("focus", () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log("Sayfaya dönüldü, yeniden bağlanılıyor...");
        connect();
      }
    });
  </script>
</body>
</html>`;
