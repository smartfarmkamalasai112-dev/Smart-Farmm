# Connection Issue Fix

## Problem
Frontend at `http://localhost:5173` cannot connect to backend at `http://100.119.101.9:5000` when accessing from Raspberry Pi.

**Errors:**
- `Firefox can't establish a connection to the server at ws://100.119.101.9:5000/socket.io`
- `Cross-Origin Request Blocked`

## Root Cause
The frontend is hardcoded to use IP `100.119.101.9:5000`, but this may not be reachable from your current location.

## Solution

### Option 1: Backend on Same Machine (localhost)
If the backend is running on the same Raspberry Pi:

```bash
# Access the dashboard at:
http://localhost:5173
```

The frontend will automatically try `localhost:5000` first.

### Option 2: Backend on Different IP
If the backend is on a different machine, use the query parameter:

```bash
# Example 1: Backend on 192.168.1.100
http://localhost:5173?backend=http://192.168.1.100:5000

# Example 2: Backend on 100.119.101.9 (original)
http://localhost:5173?backend=http://100.119.101.9:5000

# Example 3: Using hostname
http://localhost:5173?backend=http://smartfarm.local:5000
```

### Option 3: Update Frontend Configuration (Permanent)

Edit `smart-farm-dashboard/src/App.jsx` line 15:

```javascript
let SOCKET_URL = "http://YOUR_BACKEND_IP:5000";
```

Then restart the dev server.

## How to Restart Frontend

```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/smart-farm-dashboard

# Kill any existing process
killall -f "vite"

# Start fresh
npm run dev
```

## How to Restart Backend

```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb

# Kill any existing process  
killall -f "python3 app.py"

# Start fresh
python3 app.py
```

## Verifying Backend is Running

```bash
# Check if backend is responding
curl http://localhost:5000/api/status

# OR on specific IP
curl http://192.168.1.100:5000/api/status
```

Expected response:
```json
{
  "relays": [false, false, false, false],
  "mode": "MANUAL",
  "mqtt_connected": true,
  "last_update": "2026-02-17...",
  "server_time": "2026-02-17..."
}
```

## What Changed in Frontend

**Before:** Hardcoded URL
```javascript
const SOCKET_URL = "http://100.119.101.9:5000";
```

**After:** Smart detection + URL override
```javascript
let SOCKET_URL = "http://localhost:5000";  // Default to localhost

// Allow override via URL: ?backend=http://ip:port
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('backend')) {
  SOCKET_URL = urlParams.get('backend');
}
```

## Network Troubleshooting

### Check network connectivity
```bash
# Ping backend IP
ping 100.119.101.9

# Test port connectivity
curl http://100.119.101.9:5000/api/status

# Check routing
ip route show
```

### If backend IP is unreachable
1. Check if backend machine is powered on
2. Verify network cable is connected
3. Check firewall rules on backend machine
4. Try using hostname instead of IP
5. Ask network admin for correct IP address

## Testing the Fix

After making changes:

1. **Hard refresh browser:** `Ctrl+Shift+R`
2. **Open browser console:** F12 → Console tab
3. **Look for success messages:**
   ```
   ✅ Connected to Server
   📥 Fetching initial status from backend...
   ```

4. **If still seeing errors:**
   - Check the backend IP in the error
   - Make sure backend is actually running
   - Try using `?backend=http://localhost:5000` in URL

## Common Issues & Solutions

| Error | Solution |
|-------|----------|
| `ws://100.119.101.9:5000/socket.io` connection failed | Use `?backend=http://localhost:5000` |
| "Cross-Origin Request Blocked" | Backend needs CORS enabled (should be automatic) |
| "Cannot GET /api/status" | Backend not running - check with `curl` |
| Relays show all OFF but should be ON | Hard refresh with `Ctrl+Shift+R` |

---

**Last Updated:** 2026-02-17
