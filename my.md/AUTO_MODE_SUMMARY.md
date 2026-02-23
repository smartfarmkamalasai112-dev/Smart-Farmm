# 🤖 AUTO Mode - Final Summary

## ❌ ปัญหาเดิม vs ✅ วิธีแก้ไข

### ❌ ก่อนหน้า (Why It Didn't Work)
```
User Click "EDIT" → Set Config → Click "SAVE"
         ↓
Config บันทึกในหน่วยความจำของ Browser (Frontend state)
         ↓
Backend ไม่รู้ว่า Config เปลี่ยน
         ↓
Relay ยังคงทำตามค่าเดิม หรือไม่ทำอะไร
         ↓
❌ User เห็น: "ทำไมตัดตามค่าที่ตั้งไว้ไม่หรือ?"
```

### ✅ ตอนนี้ (How It Works Now)
```
User Click "EDIT" → Set Config → Click "SAVE"
         ↓
Frontend: POST /api/relay-configs
    {index: 0, target: 40, condition: '<', param: 'soil_hum'}
         ↓
Backend: Receives & Stores in Global State
    relay_configs[0] = {target: 40, condition: '<', param: 'soil_hum'}
         ↓
Sensor Data Arrives from ESP32
         ↓
evaluate_auto_mode() runs:
    - Check: soil_hum < 40?
    - Yes? → Turn Relay ON
    - No? → Turn Relay OFF
         ↓
Backend: Publishes to MQTT
    smartfarm/control → {"type": "RELAY", "index": 0, "value": true}
         ↓
ESP32: Receives & Toggles GPIO
         ↓
✅ Relay switches ON ✓
✅ Dashboard updates ✓
✅ All automatic ✓
```

---

## 🔑 Key Components Added

### 1. Backend Global State (app.py)
```python
relay_modes = {0: 'MANUAL', 1: 'MANUAL', 2: 'MANUAL', 3: 'MANUAL'}
relay_configs = {
    0: {'target': 40, 'condition': '<', 'param': 'soil_hum'},
    1: {'target': 30, 'condition': '>', 'param': 'temp'},
    2: {'target': 200, 'condition': '<', 'param': 'lux'},
    3: {'target': 60, 'condition': '<', 'param': 'soil_hum'}
}
relay_previous_state = {0: None, 1: None, 2: None, 3: None}
```

### 2. Backend Automation Engine
```python
def evaluate_auto_mode(normalized_sensors):
    """Run after every sensor update"""
    for relay_index in range(4):
        if relay_modes[relay_index] != 'AUTO':
            continue
        
        # Get config
        config = relay_configs[relay_index]
        target = config['target']
        condition = config['condition']
        param = config['param']
        
        # Get sensor value
        if param == 'soil_hum':
            value = soil_hum
        elif param == 'temp':
            value = air_temp
        # ... etc
        
        # Evaluate condition
        should_on = (value < target) if condition == '<' else (value > target)
        
        # Publish if changed
        if relay_previous_state[relay_index] != should_on:
            relay_previous_state[relay_index] = should_on
            mqtt_client.publish(MQTT_TOPIC_CONTROL, {...})
```

### 3. Backend API Endpoints
- `POST /api/relay-modes` - Change mode
- `POST /api/relay-configs` - Save AUTO config
- `GET /api/relay-modes` - Get modes
- `GET /api/relay-configs` - Get configs

### 4. Frontend Integration
```javascript
// Save config sends to backend
saveEditConfig = async () => {
    const response = await fetch('/api/relay-configs', {
        method: 'POST',
        body: JSON.stringify({index, target, condition, param})
    });
    // Backend stores & starts using it
}

// Change mode sends to backend
changeRelayMode = async (index, mode) => {
    const response = await fetch('/api/relay-modes', {
        method: 'POST',
        body: JSON.stringify({index, mode})
    });
    // Backend applies mode immediately
}
```

---

## 🎯 Usage Flow

```
┌─ User Interface ─────────────────────────────────────────┐
│                                                            │
│  Dashboard Control Tab                                    │
│  ┌─ Relay 0 (Pump) ──────────────────────────────────┐   │
│  │  [🔘 MANUAL]  [🤖 AUTO]                            │   │
│  │                                                    │   │
│  │  When AUTO: IF Condition Triggered → Relay ON     │   │
│  │  Target: 40 soil_hum  [⚙️ EDIT]                    │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  Click [⚙️ EDIT]:                                         │
│  ┌─ Edit Config Modal ─────────────────────────────────┐ │
│  │ Parameter: [soil_hum ▼]                            │ │
│  │ Condition: [< ▼]                                   │ │
│  │ Target: [40]                                       │ │
│  │ [💾 Save] [❌ Cancel]                               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
         │
         │ POST /api/relay-configs
         │ {index: 0, target: 40, condition: '<', param: 'soil_hum'}
         ↓
┌─ Backend (app.py) ───────────────────────────────────────┐
│                                                            │
│  relay_configs[0] = {target: 40, condition: '<', ...}    │
│                                                            │
│  ┌─ MQTT Message Handler ──────────────────────────────┐ │
│  │ on_mqtt_message():                                  │ │
│  │  - Normalize sensor data                            │ │
│  │  - Update state                                     │ │
│  │  - evaluate_auto_mode() ←─────────────────┐         │ │
│  └────────────────────────────────────────────┼─────────┘ │
│                                                │           │
│  ┌─ AUTO Mode Engine ──────────────────────────┼─────────┐ │
│  │ evaluate_auto_mode():                       │         │ │
│  │                                             ↓         │ │
│  │  For relay 0 (PUMP) in AUTO:                         │ │
│  │  ├─ Get soil_hum = 35                               │ │
│  │  ├─ Check: 35 < 40? YES ✓                           │ │
│  │  ├─ Previous: None → Current: True (CHANGED)        │ │
│  │  ├─ Publish to smartfarm/control:                   │ │
│  │  │  {"type": "RELAY", "index": 0, "value": true}    │ │
│  │  └─ Log: "🤖 AUTO Mode: Pump → ON"                  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
         │
         │ MQTT smartfarm/control
         │ {type: "RELAY", index: 0, value: true}
         ↓
┌─ ESP32 Firmware ──────────────────────────────────────────┐
│                                                            │
│  Subscribe smartfarm/control                              │
│  Receive: {"type": "RELAY", "index": 0, "value": true}   │
│                                                            │
│  GPIO[relay_pins[0]] = HIGH  → ⚡ RELAY SWITCHES ON     │
│                                                            │
└────────────────────────────────────────────────────────────┘
         │
         │ Physical Relay Toggles
         │ Motor/Fan/Lamp/etc. turns ON
         ↓
┌─ Dashboard Update ────────────────────────────────────────┐
│                                                            │
│  Backend broadcasts:                                      │
│  emit('auto_relay_change', {                              │
│    relay: 0,                                              │
│    status: true,                                          │
│    reason: 'soil_hum < 40'                               │
│  })                                                        │
│                                                            │
│  Frontend updates UI:                                     │
│  ✅ Relay 0 status → ON                                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 📊 Auto Mode Parameters

### Available Parameters
| Parameter | Range | Unit | Example |
|-----------|-------|------|---------|
| `soil_hum` | 0-100 | % | 40 |
| `temp` | -20 to 60 | °C | 30 |
| `hum` | 0-100 | % | 50 |
| `lux` | 0-100000 | lux | 200 |
| `co2` | 0-10000 | ppm | 600 |

### Conditions
- `<` - Less than
- `>` - Greater than

### Relay Names
| Index | Name | Thai | Default Config |
|-------|------|------|-----------------|
| 0 | Pump | ปั๊มน้ำ | soil_hum < 40 |
| 1 | Fan | พัดลม | temp > 30 |
| 2 | Lamp | ไฟส่อง | lux < 200 |
| 3 | Mist | พ่นหมอก | soil_hum < 60 |

---

## 💾 Persistence

### Configuration Storage
- ✅ Global state in backend RAM (fast)
- ✅ Survives sensor updates
- ⚠️ Lost on backend restart (acceptable for prototype)
- 🔮 Could add to SQLite if needed

### Relay State History
- ✅ Every AUTO action logged to SQLite
- ✅ Can query: "When did relay X toggle?"
- ✅ Can analyze: "How many times did pump run?"

---

## 🔍 Monitoring & Debugging

### Backend Logs Show
```
📡 Sensor Data Received: ... → Normalized: ...
🤖 AUTO Mode: Pump → ON (condition: soil_hum < 40)
🤖 AUTO Mode: Fan → OFF (condition: temp > 30)
🔧 AUTO Config Updated - Pump: IF soil_hum < 40 THEN Relay ON
⚙️ Relay 0 (Pump) mode changed to AUTO
📝 Relay history logged
✅ Status broadcasted to all clients
```

### Frontend Console
```javascript
✅ Relay 0 config saved to backend
✅ Relay 0 (Pump) mode changed to AUTO
```

### API Endpoints Test
```bash
# Get current state
curl http://100.119.101.9:5000/api/relay-modes
curl http://100.119.101.9:5000/api/relay-configs

# Save new config
curl -X POST http://100.119.101.9:5000/api/relay-configs \
  -H "Content-Type: application/json" \
  -d '{"index":0,"target":40,"condition":"<","param":"soil_hum"}'
```

---

## 🎉 What's Working

✅ **Complete AUTO Mode System**
- User-friendly UI for configuration
- Real-time automatic relay control
- Multi-relay independence
- Logging & persistence
- Error handling
- WebSocket + polling fallback

✅ **Architecture**
- Clean separation: Frontend (UI) ↔ Backend (Logic) ↔ ESP32 (Hardware)
- Async processing (non-blocking)
- Thread-safe operations
- MQTT pub/sub for hardware control

✅ **User Experience**
- Simple clicks to enable/disable AUTO
- Easy modal to configure conditions
- Real-time feedback on dashboard
- Physical relay toggles independently

---

## 🚀 Ready to Use!

1. Open dashboard in browser
2. Go to Control tab
3. Pick a relay
4. Click 🤖 AUTO
5. Click ⚙️ EDIT
6. Set your condition
7. Click 💾 Save
8. **Watch it work automatically!** ✅

---

## 📚 Related Files

- [AUTO_MODE_SETUP.md](AUTO_MODE_SETUP.md) - User guide
- [AUTO_MODE_EXPLAINED.md](AUTO_MODE_EXPLAINED.md) - Technical deep dive
- [AUTO_MODE_TEST_CHECKLIST.md](AUTO_MODE_TEST_CHECKLIST.md) - Testing guide
- [app.py](MyWeb/app.py) - Backend source
- [App.jsx](smart-farm-dashboard/src/App.jsx) - Frontend source

---

**Status: ✅ AUTO Mode Complete & Ready**
