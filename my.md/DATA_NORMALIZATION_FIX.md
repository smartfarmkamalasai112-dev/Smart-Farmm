# Data Format Mismatch Fix - Backend Data Normalization

## Problem
MQTT payload format from ESP32 doesn't match dashboard schema:

### MQTT Data (Old Format)
```json
{
  "air": {"temp": 27.0, "hum": 45.4},
  "soil": {
    "temp": 26.1,
    "hum": 75.6,
    "ph": 8.0,
    "n": 64,
    "p": 194,
    "k": 187,
    "moisture1": 70.8
  },
  "env": {"lux": 119.17, "co2": 836}
}
```

### Dashboard Schema (Expected Format)
```json
{
  "air": {"temp": 27.0, "hum": 45.4},
  "soil_1": {
    "hum": 75.6,
    "ph": 8.0,
    "n": 64,
    "p": 194,
    "k": 187
  },
  "soil_2": {"hum": 70.8},
  "env": {"lux": 119.17, "co2": 836}
}
```

## Solution
Added `normalize_sensor_data()` function in backend that:
1. Maps `soil` → `soil_1` (primary soil sensor)
2. Maps `moisture1` → `soil_2.hum` (secondary soil sensor)
3. Keeps `air` and `env` data unchanged

### Code Changes
**File:** `MyWeb/app.py`

**Added Function** (lines 157-182):
```python
def normalize_sensor_data(payload):
    """Convert MQTT data format to dashboard schema format"""
    normalized = {
        'air': payload.get('air', {}),
        'soil_1': {},
        'soil_2': {},
        'env': payload.get('env', {})
    }
    
    soil_data = payload.get('soil', {})
    if soil_data:
        normalized['soil_1'] = {
            'hum': soil_data.get('hum', 0.0),
            'ph': soil_data.get('ph', 0.0),
            'n': soil_data.get('n', 0),
            'p': soil_data.get('p', 0),
            'k': soil_data.get('k', 0)
        }
        normalized['soil_2'] = {
            'hum': soil_data.get('moisture1', 0.0)
        }
    
    return normalized
```

**Updated** `on_mqtt_message()` function:
- Calls `normalize_sensor_data()` on received payload
- Broadcasts normalized data to dashboard
- Logs both original and normalized formats for debugging

## Result
✅ Dashboard now displays correct sensor values matching MQTT input

### Example Flow:
```
MQTT Input:
  soil.hum: 75.6 → Dashboard: soil_1.hum: 75.6
  soil.ph: 8.0 → Dashboard: soil_1.ph: 8.0
  soil.n: 64 → Dashboard: soil_1.n: 64
  soil.moisture1: 70.8 → Dashboard: soil_2.hum: 70.8
```

## Backend Restart Required
```bash
pkill -f "python app.py"
cd MyWeb && python app.py
```

## Benefits
1. **Data Consistency**: Dashboard shows exact MQTT values
2. **Backward Compatible**: Still accepts old MQTT format from ESP32
3. **Future Proof**: Can easily handle data from multiple sensors
4. **Transparent**: Log shows both original and normalized data

## No Frontend Changes Needed
Frontend already expects the normalized schema format.

---
**Status:** ✅ Complete - Backend now normalizes all sensor data on receive
