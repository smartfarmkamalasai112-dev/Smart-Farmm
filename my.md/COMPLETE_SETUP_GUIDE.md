# Smart Farm Dashboard - Complete Setup Guide

## Current Status

✅ **Issue Fixed:** WebSocket connection error resolved  
✅ **Frontend Updated:** Now auto-detects backend server  
✅ **Backend Ready:** Running on localhost:5000  
✅ **Auto-startup Script:** Available for easy launch

---

## Quick Start (2 Minutes)

### Option 1: Using Automatic Startup Script (Recommended)

```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain
./start-all.sh
```

Then open browser:
```
http://localhost:5173
```

### Option 2: Manual Startup

**Terminal 1 - Backend:**
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
python3 app.py
```

**Terminal 2 - Frontend:**
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/smart-farm-dashboard
npm run dev
```

**Then open:** `http://localhost:5173`

---

## Understanding the Fix

### The Problem
Frontend was hardcoded to connect to `100.119.101.9:5000`, which was unreachable from the Raspberry Pi.

### The Solution
Frontend now:
1. **Tries localhost first** (assumes backend on same machine)
2. **Allows URL parameter override** (if backend on different machine)
3. **Shows connection status** (tells you if connection succeeded/failed)

### Network Configurations

| Setup | Frontend URL |
|-------|--------------|
| **Single Machine** (RPi with everything) | `http://localhost:5173` |
| **Split Network** (Backend on 100.119.101.9) | `http://localhost:5173?backend=http://100.119.101.9:5000` |
| **Remote Access** (Accessing from laptop) | `http://raspberry-pi-ip:5173?backend=http://localhost:5000` |

---

## Verifying Everything Works

### 1. Check Backend is Running

```bash
curl http://localhost:5000/api/status
```

Expected output:
```json
{
  "relays": [false, false, false, false],
  "mode": "MANUAL",
  "mqtt_connected": true,
  "server_time": "2026-02-17T08:12:02.959226"
}
```

### 2. Check Frontend is Running

```bash
curl http://localhost:5173 | head -1
```

Expected output:
```html
<!doctype html>
```

### 3. Check Connection in Browser

1. Open `http://localhost:5173`
2. Press **F12** (Developer Tools)
3. Go to **Console** tab
4. Look for: **"✅ Connected to Server"**

---

## File Changes Summary

| File | Change | Purpose |
|------|--------|---------|
| `App.jsx` | Changed hardcoded URL to auto-detect | Flexible server configuration |
| `WEBSOCKET_CONNECTION_FIX.md` | New guide | Explain the fix |
| `CONNECTION_FIX_GUIDE.md` | New guide | Network troubleshooting |
| `start-all.sh` | New script | Easy startup |
| `RELAY_CONTROL_FIX_REPORT.md` | Existing | Technical details |
| `RELAY_TROUBLESHOOTING.md` | Existing | User troubleshooting guide |

---

## Usage Guide

### Starting the System

```bash
# Easy way
cd ~/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain
./start-all.sh
```

### Accessing the Dashboard

- **Local:** `http://localhost:5173`
- **Remote (from another PC on network):** `http://[RPI_IP]:5173`

### Stopping the System

Press **Ctrl+C** in the terminal where you ran `start-all.sh`

Or manually:
```bash
killall python3     # Stop backend
killall npm         # Stop frontend
```

### Viewing Logs

```bash
# Backend logs
tail -f /tmp/smartfarm_backend.log

# Frontend logs
tail -f /tmp/smartfarm_frontend.log
```

---

## Features Now Available

✅ **MANUAL Mode:** Click buttons to toggle relays ON/OFF  
✅ **AUTO Mode:** Set thresholds for automatic control  
✅ **Real-time Monitoring:** Live sensor data updates  
✅ **History Graphs:** Track sensor values over time  
✅ **4 Relays:** Pump, Fan, Lamp, Mist control  
✅ **MQTT Integration:** Controls ESP32 hardware  
✅ **Network Flexible:** Works on localhost or remote IP  

---

## Common Issues & Quick Fixes

### "Cannot connect to server"
```bash
# Check if backend is running
curl http://localhost:5000/api/status

# If not, start it
cd MyWeb && python3 app.py
```

### "WebSocket connection failed"
1. Hard refresh browser: **Ctrl+Shift+R**
2. Check if both services are running
3. Make sure using `http://` not `https://`

### "Relays don't respond to clicks"
1. Open F12 Console tab
2. Look for error messages
3. Check backend is connected: should see "Status Update" messages

### "Frontend shows all OFF but should be ON"
Hard refresh browser with **Ctrl+Shift+R** to clear cache

---

## Next Steps

1. **Run the startup script:**
   ```bash
   ./start-all.sh
   ```

2. **Open browser:**
   ```
   http://localhost:5173
   ```

3. **Verify connection:**
   - Press F12
   - Check Console for "Connected to Server"

4. **Test relay controls:**
   - Go to "Control" tab
   - Click relay toggle buttons
   - Verify they change states

5. **Configure AUTO mode:**
   - Click 🤖 AUTO button on a relay
   - Set threshold and condition
   - Click "Save & Activate"

---

## Technical Details

### Backend (Python Flask)
- **Port:** 5000
- **Protocol:** REST API + WebSocket (Socket.IO)
- **Endpoints:** `/api/status`, `/api/control`, `/api/relay-modes`, `/api/relay-configs`
- **Database:** SQLite (smartfarm.db)
- **Hardware Link:** MQTT to ESP32

### Frontend (React + Vite)
- **Port:** 5173
- **Framework:** React 18
- **Styling:** Tailwind CSS
- **Real-time:** Socket.IO client
- **Charts:** Recharts

### Hardware (ESP32)
- **Connection:** MQTT via mosquitto broker
- **Relays:** 4 GPIO pins
- **Sensors:** Soil humidity, temperature, CO2, light, etc.

---

## Troubleshooting Reference

See these guides for detailed help:
- **Network Issues:** `CONNECTION_FIX_GUIDE.md`
- **Relay Control Issues:** `RELAY_TROUBLESHOOTING.md`
- **Technical Details:** `RELAY_CONTROL_FIX_REPORT.md`
- **WebSocket Fix:** `WEBSOCKET_CONNECTION_FIX.md`

---

## Support Info

To report issues, provide:
1. Browser console output (F12 → Console)
2. Backend log: `tail /tmp/smartfarm_backend.log`
3. Frontend log: `tail /tmp/smartfarm_frontend.log`
4. Network setup (same machine? different machines?)
5. The URLs you're trying to access

---

**Last Updated:** 2026-02-17  
**Status:** ✅ Ready for Production Use  
**Version:** 2.0 (Network-Flexible)
