# Fix for WebSocket Connection Error

## Problem You're Experiencing

```
Firefox can't establish a connection to the server at ws://100.119.101.9:5000/socket.io
Cross-Origin Request Blocked
```

## What Changed

I've updated the frontend to **automatically detect your backend server** instead of being hardcoded to `100.119.101.9:5000`.

### New Default Behavior

The frontend now:
1. **First tries** `http://localhost:5000` (backend on same machine)
2. **Allows override** via URL query parameter if needed

## How to Access the Dashboard

### If Backend is on Same Raspberry Pi as Frontend

```
http://localhost:5173
```

The frontend will automatically connect to backend at `http://localhost:5000`

### If Backend is on Different Machine

Use the `?backend=` parameter:

```
# Example with IP address
http://localhost:5173?backend=http://100.119.101.9:5000

# Example with hostname
http://localhost:5173?backend=http://smartfarm.local:5000

# Example with specific IP
http://localhost:5173?backend=http://192.168.1.100:5000
```

## Steps to Get Running

### 1. Start Backend

```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
python3 app.py
```

You should see:
```
 * Running on http://0.0.0.0:5000
```

### 2. Start Frontend (in new terminal)

```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/smart-farm-dashboard
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### 3. Access Dashboard

Open browser and go to:
- **http://localhost:5173** (if everything is on same machine)

### 4. Check Browser Console

Press **F12** and go to **Console** tab. You should see:

**Good signs:**
- ✅ `✅ Connected to Server`
- ✅ `📥 Fetching initial status from backend...`
- ✅ `💡 Status Update: {...}`

**Bad signs:**
- ❌ `🔥 Connection Error: websocket error`
- ❌ `Cross-Origin Request Blocked`

## Code Changes Made

### File: `smart-farm-dashboard/src/App.jsx`

**Before (Line 15):**
```javascript
const SOCKET_URL = "http://100.119.101.9:5000";
```

**After (Lines 15-25):**
```javascript
// Auto-detect backend server
let SOCKET_URL = "http://localhost:5000";

// Allow override via URL query parameter
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('backend')) {
  SOCKET_URL = urlParams.get('backend');
  console.log(`🔧 Using backend from query param: ${SOCKET_URL}`);
} else {
  console.log(`🔧 Using default backend: ${SOCKET_URL}`);
}
```

**Also updated:** All hardcoded URLs throughout the file to use `${SOCKET_URL}` variable

## Testing the Fix

### Step 1: Verify Backend is Responding

```bash
curl http://localhost:5000/api/status
```

Should return:
```json
{
  "relays": [false, false, false, false],
  "mode": "MANUAL",
  "mqtt_connected": true
}
```

### Step 2: Verify Frontend Loads

```bash
curl http://localhost:5173 | head -10
```

Should show HTML starting with `<!doctype html>`

### Step 3: Check Connection in Browser

1. Open http://localhost:5173
2. Press F12 for Developer Tools
3. Go to Console tab
4. You should see "Connected to Server" message

## Troubleshooting

### "Cannot connect to server" error

**Problem:** Backend is not running or wrong IP  
**Solution:**
```bash
# Start backend
cd MyWeb && python3 app.py
```

### "Connection Error: websocket error"

**Problem:** Frontend and backend IP mismatch  
**Solution:**
```
# If backend is on different machine, use:
http://localhost:5173?backend=http://CORRECT_IP:5000
```

### "CORS error"

**Problem:** Backend not configured for CORS  
**Solution:**  
Backend should have CORS enabled automatically. If not, check backend is running with:
```bash
curl http://localhost:5000/api/status
```

### Relays not responding to clicks

**Problem:** Connection not fully established  
**Solution:**
1. Hard refresh: `Ctrl+Shift+R` 
2. Clear browser cache and localStorage
3. Check Console tab (F12) for error messages

## Automatic Fallback Strategy

The frontend now uses this connection strategy:

```
1. Try localhost:5000 (default)
    ↓
   If fails, Socket.IO will automatically retry with exponential backoff
    ↓
   If URL parameter ?backend= provided, use that instead
    ↓
   Show "Connection Error" message to user
```

## Files Affected

- ✅ `smart-farm-dashboard/src/App.jsx` - Frontend initialization
- ✅ Created `CONNECTION_FIX_GUIDE.md` - This guide
- ❌ `MyWeb/app.py` - No changes needed (backend already flexible)
- ❌ `platformio.ini` - No changes needed (ESP32 config unchanged)

## Summary

The fix allows the frontend to work in different network configurations:

| Setup | URL |
|-------|-----|
| Everything on localhost (RPi) | `http://localhost:5173` |
| Frontend on RPi, Backend on 100.119.101.9 | `http://localhost:5173?backend=http://100.119.101.9:5000` |
| Frontend on machine A, Backend on machine B | `http://machine-a:5173?backend=http://machine-b:5000` |

---

**Last Updated:** 2026-02-17  
**Status:** Ready to test
