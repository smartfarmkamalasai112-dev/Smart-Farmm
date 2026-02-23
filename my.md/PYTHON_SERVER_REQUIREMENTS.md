# 🧠 Python Server Requirements
## After ESP32 Refactoring

**File:** `MyWeb/app.py`  
**Updated:** February 21, 2026

---

## 📋 Overview

After refactoring the ESP32 to be a "dumb actuator", the **Python Server becomes the ONLY decision maker**.

The Python Server MUST:
1. Read sensor values from MQTT
2. Evaluate relay rules and thresholds
3. Determine desired relay states (ON/OFF)
4. Send control commands to ESP32
5. Verify commands were applied
6. Track state changes and history

---

## 🔄 New Control Flow

```
┌─────────────────────────────────────┐
│   Sensor Nodes (Node 1, Node 2)     │
│   Publish to: smartfarm/sensors     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Python Server (Raspberry Pi)      │
│                                     │
│  1. Read sensor values from MQTT    │
│  2. Evaluate rules & thresholds     │
│  3. Decide relay states             │
│  4. Send control commands           │
│  5. Verify state changes            │
└──────────────┬──────────────────────┘
               │
               ▼ Send: smartfarm/control
┌─────────────────────────────────────┐
│     ESP32 Node 2 (Relay Control)    │
│     Listen: smartfarm/control       │
│                                     │
│  1. Receive control command         │
│  2. Apply to GPIO pins (ACTIVE LOW) │
│  3. Report state back to server     │
└─────────────────────────────────────┘
```

---

## 📤 Expected MQTT Topics

### **Publish FROM Server:**
**Topic:** `smartfarm/control`

**Payload Format 1 - String Values:**
```json
{
  "relay_0": "ON",
  "relay_1": "OFF",
  "relay_2": "ON",
  "relay_3": "OFF",
  ...
  "relay_11": "OFF"
}
```

**Payload Format 2 - Boolean Values:**
```json
{
  "relay_0": true,
  "relay_1": false,
  "relay_2": true,
  "relay_3": false,
  ...
  "relay_11": false
}
```

**When to Send:**
- Every time a relay state needs to change
- On AUTO mode evaluation
- On manual MANUAL mode commands from frontend
- Every 5-30 seconds (depending on evaluation frequency)

### **Subscribe FROM ESP32:**
**Topic:** `smartfarm/esp32_status`

**Payload:**
```json
{
  "relays": [true, false, true, false, true, false, true, false, true, false, true, false]
}
```

**Meaning:**
- Index 0-11 = Relay 0-11 current state
- `true` = ON (GPIO is LOW due to ACTIVE LOW)
- `false` = OFF (GPIO is HIGH due to ACTIVE LOW)

---

## 🔧 Python Code Changes Needed

### **1. Add Relay Control Function**

```python
def send_relay_control(relay_states):
    """
    Send relay control commands to ESP32 Node 2
    
    relay_states: dict or list
      - Dict: {"relay_0": "ON", "relay_1": "OFF", ...}
      - List: [True, False, True, ...] (12 elements)
    """
    control_payload = {}
    
    if isinstance(relay_states, dict):
        control_payload = relay_states
    else:
        # Convert list to dict
        for i, state in enumerate(relay_states):
            control_payload[f"relay_{i}"] = "ON" if state else "OFF"
    
    # Publish to ESP32
    client.publish("smartfarm/control", json.dumps(control_payload))
    logger.info(f"📤 Control command sent: {control_payload}")
```

### **2. Modify AUTO Mode Evaluation**

**Current Code (app.py):**
```python
# In evaluate_auto_mode() or similar function
# Currently evaluates rules and stores result in global relay_modes

# CHANGE THIS:
def evaluate_auto_mode():
    # ... evaluation logic ...
    # Update global relay_modes or relay_configs
    # (No actual GPIO control)
```

**NEW APPROACH:**
```python
def evaluate_auto_mode():
    """Evaluate relay rules and SEND commands to ESP32"""
    
    if not sensor_data or not relay_configs:
        return
    
    # Build command dict
    control_command = {}
    
    for relay_idx in range(12):
        # Get current config for this relay
        config = relay_configs[relay_idx]
        
        # Evaluate based on sensor values and config
        should_be_on = evaluate_single_relay(relay_idx, config, sensor_data)
        
        # Add to control command
        control_command[f"relay_{relay_idx}"] = "ON" if should_be_on else "OFF"
        
        # Log decision
        logger.debug(f"[AUTO] Relay {relay_idx}: {'ON' if should_be_on else 'OFF'}")
    
    # SEND COMMAND TO ESP32 (replaces local GPIO control)
    send_relay_control(control_command)
```

### **3. Modify MANUAL Mode Control**

**Current Code:**
```python
@app.route('/api/relay-control', methods=['POST'])
def relay_control():
    data = request.json
    relay_idx = data['index']
    state = data['state']  # True = ON, False = OFF
    
    # Current: sets global relay_modes[relay_idx]
    relay_modes[relay_idx] = state
    # No actual GPIO control (good!)
```

**CHANGE TO:**
```python
@app.route('/api/relay-control', methods=['POST'])
def relay_control():
    data = request.json
    relay_idx = data['index']
    state = data['state']  # True = ON, False = OFF
    
    # Still update internal state
    relay_modes[relay_idx] = state
    
    # ALSO SEND TO ESP32
    control_command = {f"relay_{relay_idx}": ("ON" if state else "OFF")}
    send_relay_control(control_command)
    
    return {"status": "sent"}
```

### **4. Monitor ESP32 Status**

**Add MQTT Handler:**
```python
def on_message_esp32_status(client, userdata, msg):
    """
    Handle ESP32 status reports
    topic: smartfarm/esp32_status
    payload: {"relays": [true, false, ...]}
    """
    try:
        payload = json.loads(msg.payload)
        relay_states = payload.get("relays", [])
        
        # Verify actual relay states match expected states
        for i, actual_state in enumerate(relay_states):
            expected_state = relay_modes[i] if i in relay_modes else False
            
            if actual_state != expected_state:
                logger.warning(f"⚠️  Relay {i}: Expected {expected_state}, got {actual_state}")
                # Could trigger re-send here
            else:
                logger.debug(f"✅ Relay {i} verified: {actual_state}")
        
        # Store for frontend display
        store_relay_status(relay_states)
        
    except Exception as e:
        logger.error(f"Error parsing ESP32 status: {e}")

# Subscribe
mqtt_client.subscribe("smartfarm/esp32_status")
mqtt_client.on_message = on_message_esp32_status
```

---

## ⚠️ Critical: ACTIVE LOW Logic

**IMPORTANT:** The ESP32 relays are **ACTIVE LOW** (HIGH active logic).

This means:
- Server sends `"ON"` (true) → ESP32 sends GPIO LOW → Relay ACTIVATES
- Server sends `"OFF"` (false) → ESP32 sends GPIO HIGH → Relay DEACTIVATES

**This is handled in ESP32 code:**
```cpp
int pinValue = newState ? LOW : HIGH;  // ACTIVE LOW
digitalWrite(pins[i], pinValue);
```

**Server doesn't need to worry about this** - just send ON/OFF semantically, ESP32 handles the pin voltage inversion.

---

## 🧪 Implementation Checklist

```
□ Add send_relay_control() function
□ Add evaluate_single_relay() logic in evaluate_auto_mode()
□ Modify AUTO mode to call send_relay_control() instead of GPIO control
□ Modify MANUAL relay endpoint to call send_relay_control()
□ Add MQTT listener for smartfarm/esp32_status
□ Add state verification logic
□ Test with serial monitor on ESP32
□ Test AUTO mode evaluation
□ Test MANUAL mode commands
□ Test mode switching
□ Verify no "Ghost Switching" occurs
```

---

## 🔍 Testing Procedure

### **Test 1: Manual Relay Control**
```bash
# Open Flask terminal:
curl -X POST http://localhost:5000/api/relay-control \
  -H "Content-Type: application/json" \
  -d '{"index": 0, "state": true}'

# Expected:
# 1. Server sends: {"relay_0": "ON"} to smartfarm/control
# 2. ESP32 receives and sets GPIO 18 to LOW
# 3. ESP32 reports: {"relays": [true, false, ...]} to smartfarm/esp32_status
# 4. Relay physically activates
# 5. Frontend shows relay state ON
```

### **Test 2: AUTO Mode Evaluation**
```bash
# Trigger AUTO evaluation:
curl -X POST http://localhost:5000/api/set-mode \
  -H "Content-Type: application/json" \
  -d '{"index": 0, "mode": "AUTO"}'

# Expected:
# 1. Server evaluates soil humidity threshold
# 2. Sends control command to smartfarm/control
# 3. ESP32 applies immediately
# 4. State verified from smartfarm/esp32_status
```

### **Test 3: No Ghost Switching**
```bash
# Manually turn relay ON via frontend
# Wait 30 seconds
# Check serial monitor on ESP32
# Expected: No unexpected relay changes

# Then turn off Flask server
# Wait 10 seconds
# Turn Flask back on
# Expected: Relays stay in their last server-commanded state
# (Server immediately resends last known state)
```

---

## 📊 Relay Configuration Format

The server already has this, but for reference:

```python
relay_configs = {
    0: {'target': 40.0, 'condition': '<', 'param': 'soil_hum'},
    1: {
        'target1': 30.0, 'condition1': '>', 'param1': 'temp',
        'target2': 80.0, 'condition2': '>', 'param2': 'hum',
        'logic': 'OR'
    },
    2: {'target': 200.0, 'condition': '<', 'param': 'lux'},
    3: {'target': 60.0, 'condition': '<', 'param': 'soil_hum'},
    # ... etc for relays 4-11
}
```

This is evaluated locally on Python to decide relay states, then sent to ESP32 as commands.

---

## 🚀 Benefits of This Architecture

✅ **Single Source of Truth** - Python server makes all decisions  
✅ **No Race Conditions** - ESP32 can't override server decisions  
✅ **Easy to Debug** - Control flow is clear and linear  
✅ **Scalable** - Can add more relays without changing ESP32 code  
✅ **Maintainable** - All business logic in Python, not embedded C++  
✅ **Flexible** - Can change rules without redeploying ESP32  

---

## ❌ What NOT to Do

❌ Don't send config updates to ESP32 anymore  
❌ Don't toggle modes on ESP32 (AUTO/MANUAL only on server)  
❌ Don't assume ESP32 remembers state after restart (send full state on startup)  
❌ Don't make decisions based on single sensor reading (server validates)  
❌ Don't forget ACTIVE LOW logic (but ESP32 handles it)  

---

**Prepared for:** SmartFarm Python Backend  
**For Integration with:** Refactored ESP32 Node 2  
**Status:** Ready for Implementation
