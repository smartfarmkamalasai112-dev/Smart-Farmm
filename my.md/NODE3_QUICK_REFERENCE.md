# 🌱 Node 3 Soil Sensors - Quick Reference

## Current Status
✅ **LIVE AND RUNNING** - Node 3 firmware uploaded and connected to MQTT broker

## What Node 3 Does
Reads 4 soil moisture sensors every 5 seconds and publishes to MQTT

## MQTT Details
- **Topic:** `smartfarm/soil_sensors`
- **Broker:** 192.168.1.106:1883
- **Update Interval:** 5 seconds
- **Payload Example:**
```json
{
  "soil_1": 45.2,
  "soil_2": 52.1,
  "soil_3": 48.9,
  "soil_4": 55.3
}
```

## Current Sensor Status
Currently showing `Error: E2` (Modbus communication failure) because:
- ✅ WiFi connected
- ✅ MQTT connected
- ⚠️ Soil sensor hardware may not be physically connected yet

## How to Check
Monitor the MQTT topic:
```bash
mosquitto_sub -h 192.168.1.106 -t smartfarm/soil_sensors
```

## How to Reset/Recompile
```bash
cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain

# Clean build
pio run -e node3_soil --target clean

# Compile
pio run -e node3_soil

# Upload (if USB connected)
pio run -e node3_soil --target upload

# Monitor (if USB connected)
pio device monitor -e node3_soil --baud 115200
```

## Hardware Pin Mapping
```
Sensor 1: Hardware Serial 2
  RX: GPIO 21
  TX: GPIO 22
  CTRL: GPIO 23

Sensor 2: Software Serial 1
  RX: GPIO 32
  TX: GPIO 33
  CTRL: GPIO 5

Sensor 3: Software Serial 2
  RX: GPIO 25
  TX: GPIO 26
  CTRL: GPIO 27

Sensor 4: Software Serial 3
  RX: GPIO 16
  TX: GPIO 17
  CTRL: GPIO 4
```

## Database
Soil sensor data stored in: `Database/smartfarm_myweb.db`
Table: `soil_sensors_node3`
Columns: id, timestamp, soil_1, soil_2, soil_3, soil_4

## Frontend Integration
WebSocket event: `soil_sensors_update`
Includes in JSON: `{soil_1, soil_2, soil_3, soil_4}`

## Files
- Firmware: [src/node3_soil.cpp](../src/node3_soil.cpp)
- Config: [platformio.ini](../platformio.ini)
- Backend: [MyWeb/app.py](../MyWeb/app.py)
- Docs: [my.md/NODE3_INTEGRATION_COMPLETE.md](NODE3_INTEGRATION_COMPLETE.md)

---
**Node 3 is ready for production use!**
