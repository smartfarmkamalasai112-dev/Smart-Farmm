# ✅ AUTO Mode Testing Checklist

## ทดสอบจริง (Live Testing)

### Prerequisites
- [ ] Backend running ✅
- [ ] Frontend running ✅
- [ ] ESP32 connected to MQTT ✅
- [ ] Sensor data flowing ✅

---

## Test 1: Change Mode to AUTO

```
Expected Result:
1. Click 🤖 AUTO button
2. Button style changes to active
3. Backend logs: "⚙️ Relay X mode changed to AUTO"
4. POST /api/relay-modes returns 200 OK
```

**Browser Console Check:**
```javascript
console.log('✅ Relay X mode changed to AUTO')
// Should show when button clicked
```

---

## Test 2: Save Configuration

```
Steps:
1. Click ⚙️ EDIT on AUTO relay
2. Modal opens with form
3. Change: Parameter, Condition, Target
4. Click 💾 Save Configuration
5. Modal closes

Expected Result:
- Backend logs: "🔧 AUTO Config Updated - RelayName: IF param condition target"
- POST /api/relay-configs returns 200 OK
- console.log shows "✅ Relay X config saved to backend"
```

**Network Tab Check:**
```
POST /api/relay-configs
Body: {"index": 0, "target": 40, "condition": "<", "param": "soil_hum"}
Status: 200 OK
```

---

## Test 3: AUTO Execution (Sensor Data Comes In)

```
Expected Behavior:
1. Sensor data arrives from ESP32
2. Backend evaluates condition
3. If condition met → relay toggles
4. Backend logs: "🤖 AUTO Mode: Relay Name → ON/OFF"
5. Dashboard shows relay status change

Example:
- Pump in AUTO: soil_hum < 40
- Current sensor: soil_hum = 35
- → Relay turns ON automatically ✅
```

**Backend Log Watch:**
```bash
tail -f /tmp/backend.log | grep "AUTO Mode"
# Should show lines like:
# 🤖 AUTO Mode: Pump → ON (condition: soil_hum < 40)
# 🤖 AUTO Mode: Fan → OFF (condition: temp > 30)
```

---

## Test 4: State Persistence (Don't Spam MQTT)

```
Expected:
- Relay stays ON if condition still true ✓
- Relay doesn't toggle every second ✓
- Only publishes when state CHANGES ✓

Check:
- Monitor mosquitto_sub -t "smartfarm/control"
- Should NOT see repeated messages
- Only changes
```

---

## Test 5: Dashboard Real-time Update

```
When AUTO relay toggles:
1. Dashboard shows new status ✅
2. No manual refresh needed ✅
3. Status persists (not reset on refresh) ✅

Check Network:
- Should see 'auto_relay_change' SocketIO event
- Frontend receives broadcast
- UI updates instantly
```

---

## Test 6: Multiple Relays AUTO at Once

```
Configure:
- Pump: AUTO (soil_hum < 40)
- Fan: AUTO (temp > 30)
- Lamp: MANUAL
- Mist: AUTO (soil_hum < 60)

Expected:
- When 1 condition triggers → only 1 relay toggles
- When 3 conditions true → 3 relays work independently
- No conflicts ✓
```

---

## Test 7: Edge Cases

### 7a: Condition Boundary
```
Config: soil_hum < 40
Current: 40.0 exactly

Expected: Relay OFF (40 is not < 40) ✓
```

### 7b: Mode Switch (AUTO → MANUAL)
```
1. Relay is AUTO, currently ON
2. Click 🔘 MANUAL mode
3. Backend logs: "mode changed to MANUAL"
4. Relay stays ON (manual takes over)
5. Can now click button to toggle manually
```

### 7c: Rapid Parameter Change
```
1. Relay in AUTO with param: soil_hum
2. Click EDIT
3. Change param to: temp
4. Save
5. Next sensor update → uses new param ✓
```

---

## Test 8: Backend Verification

### Check Global State:
```python
# SSH into backend
python
>>> from app import relay_modes, relay_configs
>>> relay_modes
{0: 'AUTO', 1: 'MANUAL', ...}
>>> relay_configs[0]
{'target': 40, 'condition': '<', 'param': 'soil_hum'}
```

### Check Endpoints:
```bash
# Get current modes
curl http://100.119.101.9:5000/api/relay-modes

# Get configurations
curl http://100.119.101.9:5000/api/relay-configs

# Both should return current state ✅
```

---

## Test 9: Database Verification

```bash
sqlite3 /home/admin/PlatformIOProjects/SmartFarmMQTT-main/MyWeb/smartfarm.db

# Check relay history
sqlite> SELECT relay_index, state, mode, timestamp FROM relay_history 
         ORDER BY timestamp DESC LIMIT 10;

# Should show AUTO mode actions:
# 0 | 1 | AUTO | 2025-02-13 10:30:45
# 0 | 0 | AUTO | 2025-02-13 10:31:12
# Relay toggled automatically ✓
```

---

## Test 10: Performance Check

```
Monitor backend CPU/Memory:

watch -n 1 'ps aux | grep python'

# Should see low CPU during normal operation
# Spikes only when sensor data arrives (expected)
# No memory leak (stable memory usage)
```

---

## 🐛 If Something Doesn't Work

### Check 1: Backend Logs
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/MyWeb
tail -50 -f app.py  # See live output
```

### Check 2: Frontend Console (F12)
```javascript
// Should see:
console.log('✅ Relay X config saved to backend')
console.log('✅ Relay X mode changed to AUTO')
```

### Check 3: Network Requests (F12 → Network)
```
POST /api/relay-modes → 200 OK
POST /api/relay-configs → 200 OK
Socket.IO connection → Connected
```

### Check 4: MQTT Broker
```bash
mosquitto_sub -t "smartfarm/control"
# When AUTO triggers, should see:
# {"type": "RELAY", "index": 0, "value": true}
```

### Check 5: ESP32 Serial Monitor
```
Connect to ESP32
Watch serial output for control messages
Relay GPIO should toggle
```

---

## ✨ Success Indicators

All tests pass when you see:
- ✅ User sets AUTO mode
- ✅ User saves configuration
- ✅ Sensor data triggers AUTO logic
- ✅ Relay toggles automatically
- ✅ Dashboard updates in real-time
- ✅ No repeated commands to MQTT
- ✅ Status saved to database
- ✅ Everything smooth & responsive

**🎉 AUTO Mode is Working!**

---

## 📞 Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Config not saving | Network tab → 200? | Restart backend |
| Relay not toggling | Sensor value vs condition | Adjust target value |
| Dashboard not updating | SocketIO connected? | Refresh browser |
| Repeated commands | relay_previous_state | Check evaluate_auto_mode() |
| Backend crashed | Logs errors? | Fix error, restart |
| MQTT not connected | Backend logs | Check broker IP/port |

