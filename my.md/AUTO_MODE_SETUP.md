# 🤖 AUTO Mode Setup Guide

## สิ่งที่เพิ่มเข้ามา (What's New)

### Backend (app.py) ✅

1. **AUTO Mode Automation Engine** 🤖
   - ระบบจะประเมินเงื่อนไขอัตโนมัติในทุกๆ ครั้งที่มีการรับข้อมูลเซ็นเซอร์
   - ถ้าเป็น AUTO mode จะควบคุม relay ตามที่กำหนดโดยไม่ต้องคลิก

2. **Global State for Automation**
   ```python
   relay_modes = {0: 'MANUAL', 1: 'MANUAL', ...}  # Mode for each relay
   relay_configs = {0: {'target': 40, 'condition': '<', 'param': 'soil_hum'}, ...}
   relay_previous_state = {0: None, 1: None, ...}  # Prevent spam commands
   ```

3. **API Endpoints for Configuration** 📡
   - `GET /api/relay-modes` - ดึงโหมดปัจจุบัน
   - `POST /api/relay-modes` - เปลี่ยนโหมด (MANUAL/AUTO)
   - `GET /api/relay-configs` - ดึงค่ากำหนดอัตโนมัติ
   - `POST /api/relay-configs` - บันทึกค่ากำหนดอัตโนมัติ

4. **evaluate_auto_mode() Function**
   ```
   For each relay in AUTO mode:
   ├─ Get sensor value (soil_hum, temp, lux, etc.)
   ├─ Compare with target using condition (< or >)
   ├─ If state changed → Publish to MQTT
   ├─ Log action with relay name
   └─ Broadcast to dashboard
   ```

### Frontend (App.jsx) ✅

1. **Automatic Config Saving**
   - `saveEditConfig()` ตอนนี้ส่งข้อมูลไปยัง backend
   - `changeRelayMode()` ตอนนี้บันทึกโหมดไปยัง backend

2. **Configuration Flow**
   ```
   User clicks "EDIT" 
   → Opens config modal
   → User fills: target, condition, parameter
   → User clicks "SAVE"
   → POST /api/relay-configs
   → Backend receives & stores
   → Next sensor update → AUTO evaluates
   → Relay turns ON/OFF automatically ✅
   ```

---

## 🎯 วิธีใช้ AUTO Mode

### Step 1: เปลี่ยนโหมดเป็น AUTO
1. ไปที่ **Control** tab
2. คลิกปุ่ม **🤖 AUTO** ของ relay ที่ต้องการ
   - ปั๊มน้ำ (Pump) 💧
   - พัดลม (Fan) 🌀
   - ไฟส่อง (Lamp) 💡
   - พ่นหมอก (Mist) 🌫️

### Step 2: ตั้งค่าเงื่อนไข
1. คลิก **⚙️ EDIT** ของ relay ที่เป็น AUTO mode
2. ตั้งค่า:
   - **Parameter** - อะไรจะควบคุม (ความชื้นดิน, อุณหภูมิ, แสง, CO₂)
   - **Condition** - เงื่อนไข (< หรือ >)
   - **Target** - ค่าเป้าหมาย

### Step 3: บันทึก
1. คลิก **💾 Save Configuration**
2. ระบบจะส่งไปยัง backend
3. ตอนนี้ relay จะทำงานอัตโนมัติ ✅

---

## 📋 ตัวอย่างการตั้งค่า

### Pump (ปั๊มน้ำ) 💧
```
Parameter: soil_hum (ความชื้นดิน)
Condition: <
Target: 40

→ ถ้าความชื้นดิน < 40% → เปิดปั๊มน้ำ ON
→ ถ้าความชื้นดิน ≥ 40% → ปิดปั๊มน้ำ OFF
```

### Fan (พัดลม) 🌀
```
Parameter: temp (อุณหภูมิ)
Condition: >
Target: 30

→ ถ้าอุณหภูมิ > 30°C → เปิดพัดลม ON
→ ถ้าอุณหภูมิ ≤ 30°C → ปิดพัดลม OFF
```

### Lamp (ไฟส่อง) 💡
```
Parameter: lux (ความสว่าง)
Condition: <
Target: 200

→ ถ้าแสง < 200 lux → เปิดไฟ ON
→ ถ้าแสง ≥ 200 lux → ปิดไฟ OFF
```

### Mist (พ่นหมอก) 🌫️
```
Parameter: soil_hum (ความชื้นดิน)
Condition: <
Target: 60

→ ถ้าความชื้นดิน < 60% → เปิดพ่นหมอก ON
→ ถ้าความชื้นดิน ≥ 60% → ปิดพ่นหมอก OFF
```

---

## 🔍 การทำงานของระบบ

### ทีละขั้นตอน:

1. **ESP32 ส่งข้อมูลเซ็นเซอร์** 📡
   - Publish ไปยัง `smartfarm/sensors`
   - ทุก ๆ X วินาที

2. **Backend รับข้อมูล** 📥
   - on_mqtt_message() ทำงาน
   - Normalize format
   - บันทึกลงฐานข้อมูล
   - Emit ไปยัง dashboard

3. **Auto Mode Evaluation** 🤖
   - evaluate_auto_mode() ทำงาน
   - ตรวจสอบทุก relay ที่เป็น AUTO
   - ประเมินเงื่อนไขของแต่ละ relay
   - ถ้าต่างจากสถานะเก่า → Publish ไปยัง `smartfarm/control`

4. **Log & Broadcast** 📊
   - บันทึก action ลงฐานข้อมูล
   - Broadcast ไปยัง dashboard ทั้งหมด
   - แสดง: `🤖 AUTO Mode: Pump → ON (condition: soil_hum < 40)`

5. **ESP32 รับคำสั่ง** ⚡
   - Subscribe `smartfarm/control`
   - ทำงาน GPIO pins
   - Relay จริง เปิด/ปิด

---

## 🐛 Troubleshooting

### ปัญหา: ตั้งค่าแล้วแต่ relay ไม่ตัด
**วิธีแก้:**
1. ตรวจสอบว่าเป็น AUTO mode ❌ ❌ ❌
2. ดู browser console (F12) → Network tab
3. POST /api/relay-configs ต้องส่ง 200 OK ✅
4. ตรวจสอบเซ็นเซอร์ว่ามีค่าเข้ามา ✅

### ปัญหา: Config ไม่บันทึก
**วิธีแก้:**
1. ตรวจสอบ backend logs:
   ```bash
   tail -f /tmp/backend.log
   ```
2. ดู console: `🔧 AUTO Config Updated`
3. ลองปิด modal และเปิดใหม่

### ปัญหา: Relay เปิด/ปิด บ่อยเกินไป
**วิธีแก้:**
- Relay state tracking ป้องกันการส่งซ้ำ
- ถ้ายังเกิน → ปรับ target value
- ให้ห่างจากค่าเซ็นเซอร์ปัจจุบัน

---

## 📡 API Documentation

### POST /api/relay-modes
เปลี่ยนโหมด relay
```json
{
  "index": 0,
  "mode": "AUTO"
}
```

### POST /api/relay-configs
ตั้งค่า AUTO mode
```json
{
  "index": 0,
  "target": 40,
  "condition": "<",
  "param": "soil_hum"
}
```

**Parameter ที่สามารถใช้:**
- `soil_hum` - ความชื้นดิน (0-100%)
- `temp` - อุณหภูมิ (°C)
- `hum` - ความชื้นอากาศ (%)
- `lux` - ความสว่าง (lux)
- `co2` - CO₂ (ppm)

**Condition ที่สามารถใช้:**
- `<` - น้อยกว่า
- `>` - มากกว่า

---

## ✨ ว่าที่เหลือ

### AUTO Mode ตอนนี้:
- ✅ ประเมินเงื่อนไขอัตโนมัติ
- ✅ ควบคุม relay ตามค่ากำหนด
- ✅ บันทึก action ลงฐานข้อมูล
- ✅ Broadcast ไปยัง dashboard
- ✅ ป้องกันการส่งคำสั่งซ้ำ

### ตอนหน้า (อาจเพิ่มเติม):
- Hysteresis (ให้ gap ระหว่าง ON/OFF)
- Time delay (รอ X วินาทีก่อนตัดสินใจ)
- Scheduling (กำหนดเวลา)
- History logs สำหรับทุก auto action

---

**เสร็จแล้ว! 🎉 AUTO Mode ส่วนดิจิทัลอัตโนมัติพร้อม**
