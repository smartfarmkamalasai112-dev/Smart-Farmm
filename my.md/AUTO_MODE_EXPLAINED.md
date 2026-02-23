# 🎯 AUTO Mode: สิ่งที่เปลี่ยนแปลง

## 📝 Summary of Changes

### ✅ แก้ไขปัญหา: Configuration ไม่ทำงาน

**ปัญหาเดิม:**
- ผู้ใช้สามารถตั้งค่า AUTO mode ได้ ✅
- แต่ Relay ไม่ตัดตามค่าที่ตั้งไว้ ❌
- Configuration เก็บไว้ใน frontend state เท่านั้น ❌

**วิธีแก้ไข:**
1. **Backend ได้ Automation Engine** 🤖
   - ฟังก์ชัน `evaluate_auto_mode()` ประเมินเงื่อนไขอัตโนมัติ
   - ทุกครั้งที่มีข้อมูลเซ็นเซอร์เข้ามา → ตรวจสอบเงื่อนไข → ควบคุม Relay
   - ป้องกันการส่งคำสั่งซ้ำ (check `relay_previous_state`)

2. **Frontend ส่งค่ากำหนดไปยัง Backend** 📡
   - `saveEditConfig()` → POST /api/relay-configs
   - `changeRelayMode()` → POST /api/relay-modes
   - ค่ากำหนดถูกบันทึกลงเซิร์ฟเวอร์ (persistent)

3. **Global State ในเซิร์ฟเวอร์** 💾
   ```python
   relay_modes = {0: 'MANUAL', 1: 'MANUAL', 2: 'MANUAL', 3: 'MANUAL'}
   relay_configs = {
     0: {'target': 40, 'condition': '<', 'param': 'soil_hum'},
     ...
   }
   relay_previous_state = {0: None, 1: None, ...}  # Track state
   ```

---

## 📊 Flow Diagram: Auto Mode ทำงานไง

```
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣ USER ACTION: Relay Mode Changed to AUTO                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       v
        ┌──────────────────────────────┐
        │ Frontend: changeRelayMode()   │
        │ - Update local state          │
        │ - POST /api/relay-modes       │
        └──────────────┬───────────────┘
                       │
                       v
        ┌──────────────────────────────┐
        │ Backend: POST /api/relay-modes│
        │ - Update relay_modes[index]   │
        │ - Log: "Relay X mode → AUTO"  │
        └──────────────┬───────────────┘
                       │
                       v
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣ USER ACTION: Edit Config (Target, Condition, Parameter)      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               v
                ┌──────────────────────────────┐
                │ Frontend: saveEditConfig()    │
                │ - Update local config state   │
                │ - POST /api/relay-configs     │
                └──────────────┬───────────────┘
                               │
                               v
                ┌──────────────────────────────┐
                │ Backend: POST /api/relay-configs
                │ - Update relay_configs[index] │
                │ - Log: "Config saved"         │
                └──────────────┬───────────────┘
                               │
                               v
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣ SENSOR DATA INCOMING (Every X seconds)                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ MQTT: smartfarm/sensors              │
        │ ESP32 sends: {air, soil, env, ...}   │
        └──────────────┬───────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ Backend: on_mqtt_message()           │
        │ - Normalize sensor data              │
        │ - Update RAM state                   │
        │ - Save to SQLite                     │
        │ - Emit to dashboard                  │
        └──────────────┬───────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ ⭐ NEW: evaluate_auto_mode()          │
        │                                       │
        │ For each relay (0-3):                │
        │   if relay_modes[i] == 'AUTO':       │
        │     - Get sensor value (param)       │
        │     - Check condition vs target      │
        │     - If changed → Publish MQTT      │
        │     - Log action                     │
        │     - Broadcast status change        │
        └──────────────┬───────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ MQTT: smartfarm/control              │
        │ Backend publishes:                   │
        │ {type: "RELAY", index: X, value: T/F}
        └──────────────┬───────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ ESP32: Subscribes smartfarm/control  │
        │ - Receives relay command             │
        │ - GPIO pins toggle                   │
        │ - Relay switches ON/OFF ⚡           │
        └──────────────────────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────┐
        │ Dashboard & All Clients              │
        │ - SocketIO: auto_relay_change event  │
        │ - Update UI status ✅                │
        │ - Log: "🤖 AUTO Mode: X → ON"        │
        └──────────────────────────────────────┘
```

---

## 🔧 Code Changes

### Backend (app.py)

**Global State Added:**
```python
# Lines ~48-64
relay_modes = {0: 'MANUAL', 1: 'MANUAL', 2: 'MANUAL', 3: 'MANUAL'}
relay_configs = {
    0: {'target': 40, 'condition': '<', 'param': 'soil_hum'},
    1: {'target': 30, 'condition': '>', 'param': 'temp'},
    2: {'target': 200, 'condition': '<', 'param': 'lux'},
    3: {'target': 60, 'condition': '<', 'param': 'soil_hum'}
}
relay_previous_state = {0: None, 1: None, 2: None, 3: None}
```

**evaluate_auto_mode() Function Added:**
- Lines ~230-290
- Runs on every sensor update (in separate thread)
- Checks each relay's condition
- Publishes to MQTT if state changed
- Prevents command spam

**API Endpoints Added:**
- `GET /api/relay-modes` - Get current modes
- `POST /api/relay-modes` - Change relay mode
- `GET /api/relay-configs` - Get configurations
- `POST /api/relay-configs` - Save AUTO config

**on_mqtt_message() Modified:**
- Line 354: Added threading call to `evaluate_auto_mode()`
- Now processes AUTO logic after every sensor update

### Frontend (App.jsx)

**saveEditConfig() Modified:**
- Lines ~224-248
- Now async function
- Sends POST /api/relay-configs to backend
- Config is no longer local-only

**changeRelayMode() Modified:**
- Lines ~208-230
- Now async function
- Sends POST /api/relay-modes to backend
- Mode change is immediately synced

---

## 🚀 System Ready!

### What Works Now:
- ✅ Frontend: User sets MANUAL/AUTO mode
- ✅ Frontend: User configures AUTO conditions
- ✅ Backend: Receives configuration
- ✅ Backend: Evaluates conditions on each sensor update
- ✅ Backend: Automatically controls relays
- ✅ Backend: Logs all AUTO actions
- ✅ Frontend: Displays AUTO relay status changes
- ✅ ESP32: Receives & executes relay commands

### Test It:
1. Open dashboard
2. Control tab → Pick a relay
3. Click 🤖 AUTO
4. Click ⚙️ EDIT
5. Set: Parameter, Condition, Target
6. Click 💾 Save
7. Watch relay automatically turn ON/OFF based on sensor values

---

## 📋 Backend Logs You'll See

```
🎮 Relay Control Request: Relay 0 → ON
📡 MQTT Published: smartfarm/control → {"type": "RELAY", ...}
📝 Relay history logged
✅ Status broadcasted to all clients

🤖 AUTO Mode: Pump → ON (condition: soil_hum < 40)
🔧 AUTO Config Updated - Pump: IF soil_hum < 40 THEN Relay ON
⚙️ Relay 0 (Pump) mode changed to AUTO
```

---

**🎉 AUTO Mode ทำงานอัตโนมัติแล้ว!**
