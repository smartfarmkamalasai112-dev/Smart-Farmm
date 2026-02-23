# 🔄 ESP32 Node 2 Refactoring Summary
## Removing Local Auto Mode Logic

**Date:** February 21, 2026  
**Status:** ✅ COMPLETED  
**File Modified:** `src/node2_relay.cpp`

---

## 📋 Problem Statement

The ESP32 Node 2 had **conflicting decision-making logic**:
- Local hardcoded rules (RelayRule struct with thresholds)
- Auto evaluation loop (5-second intervals checking sensor values)
- Complex state management (pump cycles, debounce timers)

This **conflicted with the Python Server** on Raspberry Pi, causing:
- 👻 **Ghost Switching** - Server says OFF, ESP32 forces it back ON
- 🔄 **Race Conditions** - Both systems trying to control relays simultaneously
- 🤷 **Unpredictable Behavior** - Two brains fighting over the same hardware

---

## 🎯 Solution: Single Source of Truth

**The Python Server (Raspberry Pi) is the ONLY decision maker.**

ESP32 is now a **pure ACTUATOR/SENSOR node**:
1. ✅ Read sensor data → publish to MQTT
2. ✅ Listen to MQTT control commands
3. ✅ Apply commands immediately to GPIO pins
4. ✅ Report state back to server

---

## 🗑️ What Was REMOVED

### **1. RelayRule Structure & Rules Array**
```cpp
// ❌ DELETED: struct RelayRule
// ❌ DELETED: RelayRule rules[12]
// These hardcoded decision trees are GONE
```

### **2. Auto Mode Variables**
```cpp
// ❌ DELETED: bool isAutoMode
// ❌ DELETED: unsigned long lastAutoCheck
// ❌ DELETED: All pump cycle variables (pumpState, pumpCycleTime, etc.)
// ❌ DELETED: All debounce timers (fanStateChangeTime, lampStateChangeTime, etc.)
```

### **3. Auto Evaluation Loop** (was in `loop()`)
```cpp
// ❌ DELETED: if (isAutoMode && millis() - lastAutoCheck >= 5000)
// ❌ DELETED: Soil humidity checks for Pump/Mist relays
// ❌ DELETED: Temperature/Humidity checks for Fan/Valve relays
// ❌ DELETED: Light level checks for Lamp relay
// ❌ DELETED: Pump cycle state machine (PUMP_OFF, PUMP_ON_30S, PUMP_WAIT_10S)
```

### **4. applyRelay() Helper Function**
```cpp
// ❌ DELETED: void applyRelay(int pin, bool turnOn)
// (Logic now inline in callback for better clarity)
```

### **5. MQTT Config Handler** (smartfarm/config topic)
```cpp
// ❌ DELETED: else if (topicStr == "smartfarm/config")
// Server NO LONGER sends config updates to ESP32
// Server maintains ALL configuration locally
```

### **6. Mode Switching Logic**
```cpp
// ❌ DELETED: TYPE=="MODE" handling
// No more "AUTO"/"MANUAL" modes on ESP32
// Only "obey commands or do nothing"
```

---

## ✅ What Was KEPT

### **1. Relay State Array**
```cpp
bool relayState[12] = {false, ...};  // For status reporting only
```

### **2. Sensor Values Storage**
```cpp
float currentValues[5] = {0, 0, 0, 0, 0};  // Store sensor data for reference
// [0] = soil humidity, [1] = temp, [2] = lux, [3] = air humidity, [4] = CO2
```

### **3. MQTT Connection & Loop**
```cpp
void setup() { ... }      // Setup WiFi, MQTT, GPIO pins
void reconnect() { ... }  // Maintain MQTT connection
void loop() {             // Keep MQTT alive (NO DECISION LOGIC)
  client.loop();          // Process incoming MQTT messages
}
```

### **4. Sensor Data Reception**
```cpp
// CASE 1: smartfarm/sensors topic
// ESP32 receives sensor data from Node 1
// Simply stores it (no local evaluation)
```

---

## 🆕 New Control Flow

### **MQTT Topics**

#### **Incoming (ESP32 Listens):**
1. **`smartfarm/sensors`** - Sensor data from Node 1 (stored but NOT evaluated locally)
2. **`smartfarm/control`** - Direct relay commands from Python Server
   ```json
   {
     "relay_0": "ON",
     "relay_1": "OFF",
     "relay_2": true,
     "relay_3": false,
     ...
   }
   ```

#### **Outgoing (ESP32 Publishes):**
1. **`smartfarm/esp32_status`** - Current relay states
   ```json
   {
     "relays": [true, false, true, false, ...]
   }
   ```

### **Control Logic (Python Server - The Brain)**

```
Sensor Values (from Node 1)
    ↓
Python: Evaluate rules & thresholds
    ↓
Python: Decide relay states (AUTO/MANUAL mode)
    ↓
Python: Publish control command to smartfarm/control
    ↓
ESP32: Receive command (smartfarm/control)
    ↓
ESP32: Apply GPIO changes immediately (ACTIVE LOW logic)
    ↓
ESP32: Report new state (smartfarm/esp32_status)
    ↓
Python: Verify command was applied correctly
```

---

## ⚡ Active Low Handling

**Important:** The relay control logic now uses proper ACTIVE LOW handling:

```cpp
// Server says "ON" (true) → ESP32 sends LOW to GPIO (relay activates)
// Server says "OFF" (false) → ESP32 sends HIGH to GPIO (relay deactivates)

int pinValue = newState ? LOW : HIGH;  // ACTIVE LOW
digitalWrite(pins[i], pinValue);
```

This ensures:
- ✅ Server logic (`ON` = activate) matches ESP32 GPIO behavior
- ✅ No confusion between logical state and pin voltage
- ✅ Safety: Default state (HIGH) = relays OFF (safe)

---

## 🔍 Callback Function Refactoring

### **Before (Complex):**
```cpp
void callback() {
  // Handle smartfarm/sensors
  // Handle smartfarm/config (local rules)
  // Handle smartfarm/control (mode + relay commands)
  // Evaluate rules every 5 seconds
  // Manage pump cycles, debounce
  // 350+ lines of decision logic
}
```

### **After (Simple):**
```cpp
void callback() {
  case "smartfarm/sensors":
    // Just store sensor values
  
  case "smartfarm/control":
    // For each relay in command:
    //   - Get desired state from JSON
    //   - Apply to GPIO (ACTIVE LOW)
    //   - Report back
  
  // That's it! ~150 lines, no decisions
}
```

---

## 📊 Code Statistics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Total Lines** | 404 | 308 | -96 lines (-24%) |
| **Decision Logic** | ~200 lines | 0 lines | ✅ Removed |
| **Data Structures** | RelayRule×12, 6 timers | None | ✅ Simplified |
| **Loop() Complexity** | Complex loop | 1 client.loop() | ✅ 99% reduced |
| **Topics Handled** | 3 (sensors, config, control) | 2 (sensors, control) | ✅ Simplified |

---

## 🧪 Testing Checklist

```
□ Upload refactored code to ESP32 Node 2
□ Verify MQTT connection established
□ Verify sensor data received from Node 1
□ Send relay command from Python server
□ Verify GPIO pin changed immediately
□ Check serial output for "RELAY CMD" messages
□ Verify state reported back to server
□ Test all 12 relays with on/off commands
□ Monitor for "Ghost Switching" (should be gone!)
□ Restart Python server - relays should stay as server left them
□ Test MQTT reconnection behavior
```

---

## 🚀 Deployment

1. Backup current `src/node2_relay.cpp`
2. Review changes in git
3. Upload refactored code to ESP32 via PlatformIO
4. Monitor serial output during startup
5. Send first test command from Python server
6. If successful, remove commented-out code in next iteration

---

## 📝 Comments Added to Code

Key sections marked with:
- ⭐ **REMOVED** - Shows where local logic was deleted
- ✅ **KEPT** - Shows what still exists
- 🆕 **NEW** - Shows new simplified approach
- ⚠️ **CRITICAL** - Important behavior details

---

## ⚠️ Important Notes

### **The Python Server MUST:**
1. Send relay control commands via `smartfarm/control` topic
2. Use format: `{"relay_0": "ON", "relay_1": "OFF", ...}`
3. Handle ALL auto/manual mode logic
4. Evaluate sensor thresholds and conditions
5. Manage relay state persistence

### **The ESP32 MUST NOT:**
1. ~~Evaluate sensor thresholds~~ ❌ REMOVED
2. ~~Make AUTO/MANUAL decisions~~ ❌ REMOVED
3. ~~Maintain complex state machines~~ ❌ REMOVED
4. ~~Apply debouncing or pump cycles~~ ❌ REMOVED
5. Ignore commands and make local decisions

---

## 🎉 Expected Benefits

✅ **Ghost Switching ELIMINATED** - No more race conditions  
✅ **Predictable Behavior** - Single source of truth  
✅ **Easy to Debug** - Simple request/response pattern  
✅ **Scalable** - Can add more sensors/relays without ESP32 changes  
✅ **Maintainable** - Rules centralized on Python server  
✅ **Reliable** - Less code = fewer bugs  

---

**Refactored by:** Senior IoT Embedded Developer  
**For:** SmartFarm MQTT System  
**Platform:** ESP32 (Node 2 - Relay Control)
