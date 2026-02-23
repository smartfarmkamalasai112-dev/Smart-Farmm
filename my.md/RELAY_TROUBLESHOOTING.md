# Quick Relay Control Troubleshooting Guide

## ✅ If Relays Are Working

Great! The system is functioning correctly. Just verify:

- [ ] Frontend shows correct relay states when you first open it
- [ ] Clicking "Turn ON" button changes state to ON
- [ ] Clicking "Turn OFF" button changes state to OFF
- [ ] Console shows API responses (F12 → Console tab)

---

## ❌ If Relays Still Don't Work

Follow these steps in order:

### 1️⃣ Browser Issues

**Action:**
```
1. Hard refresh the page: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. Clear browser cache: Settings → Privacy → Clear browsing data
3. Try incognito/private window to avoid cache
```

**Why:** Vite development server caches might not update immediately.

---

### 2️⃣ Check Backend Status

**Action:**
```bash
ps aux | grep "python3 app.py"
```

**Expected Output:**
```
admin     312309  3.0  1.0  99232 84864 pts/62   S    17:16   0:20 python3 app.py
```

**If not running:**
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
python3 app.py
```

---

### 3️⃣ Check Frontend Status

**Action:**
```bash
ps aux | grep vite
```

**Expected Output:**
```
admin     315348  1.2  1.4 6245184 115792 pts/76 Sl+  17:22   0:04 node ... vite
```

**If not running:**
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/smart-farm-dashboard
npm run dev
```

---

### 4️⃣ Test Backend API Directly

**Action - Check status:**
```bash
curl http://100.119.101.9:5000/api/status
```

**Expected Output:**
```json
{
  "relays": [false, false, false, false],
  "mode": "MANUAL",
  "mqtt_connected": true,
  "last_update": "2026-02-16T17:36:04.466509",
  "server_time": "2026-02-16T17:36:04.497214"
}
```

**Action - Test relay control:**
```bash
curl -X POST http://100.119.101.9:5000/api/control \
  -H "Content-Type: application/json" \
  -d '{"index": 0, "value": true}'
```

**Expected Output:**
```json
{
  "status": "success",
  "message": "Relay 0 ON (MANUAL mode)",
  "relay": 0,
  "value": true,
  "mode": "MANUAL"
}
```

**If this fails:** Backend issue - check logs for errors

---

### 5️⃣ Check MQTT Connection

**Action:**
```bash
mosquitto_sub -h localhost -t "smartfarm/#" -W 2
```

**Expected Output:** Should see MQTT messages flowing

**If times out:** MQTT broker not running
```bash
# Restart mosquitto
sudo systemctl restart mosquitto
```

---

### 6️⃣ Check Browser Console

**Action:**
1. Open DevTools: F12
2. Go to Console tab
3. Reload page
4. Look for error messages

**Expected Messages:**
```
✅ Connected to Server
📥 Fetching initial status from backend...
📥 Initial status received: {...}
💡 Status Update: {...}
```

**If you see errors:**
- Red error messages = JavaScript errors
- Network errors = Connection to backend failed
- CORS errors = Likely configuration issue

---

### 7️⃣ Clear LocalStorage

**Action:**
1. Open DevTools: F12
2. Application tab
3. LocalStorage → smartfarm domain
4. Delete all smartfarm_* entries
5. Reload page

**Why:** Corrupted settings might be cached in browser.

---

### 8️⃣ Check Relay Modes

**Action:**
```bash
curl http://100.119.101.9:5000/api/relay-modes
```

**Expected Output:**
```json
{
  "0": "MANUAL",
  "1": "MANUAL",
  "2": "MANUAL",
  "3": "MANUAL"
}
```

**If not MANUAL:** Set to MANUAL
```bash
curl -X POST http://100.119.101.9:5000/api/relay-modes \
  -H "Content-Type: application/json" \
  -d '{"index": 0, "mode": "MANUAL"}'
```

---

### 9️⃣ Check Relay Configs

**Action:**
```bash
curl http://100.119.101.9:5000/api/relay-configs | python3 -m json.tool | head -20
```

**Expected:** Should show configuration for each relay with targets and conditions.

---

### 🔟 Check Network Tab

**Action:**
1. Open DevTools: F12
2. Network tab
3. Click relay button
4. Look for API requests

**Look for:**
- Request to `http://100.119.101.9:5000/api/control`
- Response status: 200
- Response contains `"status": "success"`

**If request is missing:** Button click handler not working  
**If response is 404:** Wrong endpoint path  
**If response is 500:** Backend error - check backend logs

---

## 🔧 Advanced Debugging

### View Backend Logs

**Action:**
```bash
# If using supervisor
sudo tail -50 /var/log/smartfarm/app.log

# If running directly, check stderr
# Look in the terminal where you ran: python3 app.py
```

### Test with Python

**Action:** Create `test_relays.py`:
```python
import requests

base = "http://100.119.101.9:5000"

# Get status
print("Status:", requests.get(f"{base}/api/status").json())

# Toggle relay 0 ON
print("Toggle ON:", requests.post(f"{base}/api/control", 
    json={"index": 0, "value": True}).json())

# Get status
print("Status:", requests.get(f"{base}/api/status").json())

# Toggle relay 0 OFF
print("Toggle OFF:", requests.post(f"{base}/api/control", 
    json={"index": 0, "value": False}).json())
```

**Run:**
```bash
python3 test_relays.py
```

---

## 📋 Checklist for Support

If you need to report an issue, provide:

- [ ] Browser console output (F12 → Console)
- [ ] Backend process status: `ps aux | grep python3`
- [ ] Frontend process status: `ps aux | grep vite`
- [ ] API response: `curl http://100.119.101.9:5000/api/status`
- [ ] What you see in browser (screenshot)
- [ ] What you expect to happen
- [ ] Which relay number (0=Pump, 1=Fan, 2=Lamp, 3=Mist)

---

## 🚀 Common Solutions

| Issue | Solution |
|-------|----------|
| All relays show OFF even when they should be ON | Browser cache - do Ctrl+Shift+R |
| Button click does nothing | Check browser console (F12) for errors |
| API responds but UI doesn't update | Check SocketIO connection (should say "Connected") |
| Backend says "relay control success" but relay doesn't change | Check MQTT connection and ESP32 logs |
| "Cannot connect to server" error | Check if backend is running on 100.119.101.9:5000 |
| Config changes don't persist | Check localStorage - delete and retry |
| AUTO mode not triggering relay | Verify sensor values vs. config thresholds |

---

## 📞 Still Having Issues?

1. **Check the RELAY_CONTROL_FIX_REPORT.md** for full technical details
2. **Review browser console** (F12 → Console) for error messages
3. **Verify backend is running** with correct IP and port
4. **Run API tests** directly to isolate the issue
5. **Check MQTT connection** status

---

**Last Updated:** 2026-02-16  
**Status:** System fully functional
