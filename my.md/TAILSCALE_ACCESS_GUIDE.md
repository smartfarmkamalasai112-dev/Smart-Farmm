# 🌐 Access Dashboard from Tailscale IP

## Configuration Updated ✅

The dashboard is now configured to be accessible from **Tailscale IP: 100.119.101.9**

---

## 📍 How to Access

### From Your Machine
```
Open browser and go to:
http://100.119.101.9:5173
```

### What You'll See
- 🌱 Smart Farm Dashboard
- 📊 Monitor tab with sensor data
- 🎮 Control tab with relay controls
- 🤖 AUTO mode settings

---

## ⚙️ What Changed

### vite.config.js
```javascript
server: {
  host: '0.0.0.0',              // Listen on all interfaces
  port: 5173,                   // Frontend port
  proxy: {
    '/api': {
      target: 'http://100.119.101.9:5000',  // Backend IP
    }
  },
  allowedHosts: [
    '100.119.101.9',
    'localhost',
    '127.0.0.1'
  ]
}
```

### Already Correct in App.jsx
```javascript
const SOCKET_URL = "http://100.119.101.9:5000";  // ✅ Backend connection
```

---

## 🚀 Access Methods

| Method | URL | Works |
|--------|-----|-------|
| Tailscale IP | http://100.119.101.9:5173 | ✅ |
| Localhost | http://localhost:5173 | ✅ |
| 127.0.0.1 | http://127.0.0.1:5173 | ✅ |

---

## 🔗 Connection Flow

```
Browser (Tailscale: 100.119.101.9:5173)
         ↓
Frontend Server (Vite, all interfaces :5173)
         ↓
Backend Server (Flask, :5000)
         ↓
MQTT Broker
         ↓
ESP32 Hardware
```

---

## ✅ Ports Used

- **5173** - Frontend (Vite dev server)
- **5000** - Backend (Flask-SocketIO)
- **1883** - MQTT (local broker)

---

## 🐛 If Dashboard Doesn't Load

### Check 1: Frontend Running
```bash
ps aux | grep node
# Should see: npm run dev or node process
```

### Check 2: Backend Running
```bash
ps aux | grep python
# Should see: python app.py running
```

### Check 3: Network Connection
```bash
# Ping the server
ping 100.119.101.9

# Test port 5173
curl http://100.119.101.9:5173
```

### Check 4: Browser Console
- Press F12 to open DevTools
- Check Console tab for errors
- Check Network tab for failed requests

---

## 🎉 Dashboard Features Available

✅ Real-time sensor data
✅ AUTO mode configuration
✅ Current sensor value display
✅ Relay control (MANUAL & AUTO)
✅ Settings persistence (localStorage)
✅ Graph visualization
✅ Real-time updates

---

## 📝 Configuration Files

- **Frontend:** [smart-farm-dashboard/vite.config.js](../../vite.config.js) ✅ Updated
- **Frontend:** [smart-farm-dashboard/src/App.jsx](../../src/App.jsx) ✅ Correct
- **Backend:** [MyWeb/app.py](../../MyWeb/app.py) ✅ Running on :5000

---

**Dashboard is ready! 🚀 Open http://100.119.101.9:5173 in your browser**
