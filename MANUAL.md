# 📗 คู่มือการใช้งาน Smart Farm Dashboard
## ระบบฟาร์มอัจฉริยะ — คู่มือฉบับสมบูรณ์

---

## 📌 สารบัญ
1. [ข้อมูลระบบ](#ข้อมูลระบบ)
2. [การเข้าถึงระบบ](#การเข้าถึงระบบ)
3. [หน้า Monitor — ติดตามสถานะ](#หน้า-monitor)
4. [หน้า Control — ควบคุมรีเลย์](#หน้า-control)
5. [หน้า Data — ตารางข้อมูล](#หน้า-data)
6. [หน้า Graph — กราฟ](#หน้า-graph)
7. [โหมดอัตโนมัติ (AUTO MODE)](#โหมดอัตโนมัติ)
8. [รายละเอียด Relay ทั้ง 12 ตัว](#relay-ทั้ง-12-ตัว)
9. [ค่า Sensor ทั้งหมด](#sensor-ทั้งหมด)
10. [การตั้งค่า Node ESP32](#node-esp32)
11. [การ Restart ระบบ](#การ-restart-ระบบ)
12. [การกู้คืน SD Card](#การกูคืน-sd-card)
13. [แก้ปัญหาเบื้องต้น](#แกปัญหาเบื้องต้น)

---

## 📍 ข้อมูลระบบ

| รายการ | ข้อมูล |
|--------|--------|
| Raspberry Pi IP (LAN) | `192.168.1.106` |
| Tailscale IP | `100.124.102.88` |
| Dashboard (หน้าเว็บ) | `http://192.168.1.106:5005` |
| Flask API | `http://192.168.1.106:5000` |
| MQTT Broker | `192.168.1.106:1883` |
| MQTT WebSocket | `192.168.1.106:9001` |
| GitHub Repo | `https://github.com/smartfarmkamalasai112-dev/Smart-Farmm` |

---

## 🌐 การเข้าถึงระบบ

### เข้าจากในบ้าน (LAN)
เปิดเบราว์เซอร์แล้วพิมพ์:
```
http://192.168.1.106:5005
```

### เข้าจากนอกบ้าน (Tailscale VPN)
```
http://100.124.102.88:5005
```
> ต้องเปิดแอป Tailscale บนมือถือหรือคอมก่อน

---

## 📊 หน้า Monitor

**แท็บแรก** — แสดงข้อมูล Sensor แบบ Real-time

### สิ่งที่แสดงบนหน้านี้

#### 🌡️ ค่าอุณหภูมิและความชื้น (Node 1)
| การ์ด | ค่าที่แสดง | หน่วย |
|-------|-----------|-------|
| อุณหภูมิ | ค่าจาก DHT22 | °C |
| ความชื้นอากาศ | ค่าจาก DHT22 | % |
| แสง (Lux) | ค่าจาก BH1750 | lux |
| CO₂ | ค่าจาก MH-Z19 | ppm |

#### 🌱 ค่าความชื้นดิน
| Sensor | ชื่อ | ตำแหน่ง |
|--------|------|---------|
| SN-3002 | ดิน 2 แปลง 1 | Node 1 |
| SN-300SD | ดิน 1 แปลง 1 | Node 1 |
| Node3 S1 | ดิน 2 แปลง 2 | Node 3 |
| Node3 S2 | ดิน 3 แปลง 1 | Node 3 |
| Node3 S3 | ดิน 1 แปลง 2 | Node 3 |
| Node3 S4 | ดิน 3 แปลง 2 | Node 3 |

#### 🔬 ค่า NPK และ pH (Modbus)
| ค่า | ความหมาย |
|-----|---------|
| N | ไนโตรเจน (mg/kg) |
| P | ฟอสฟอรัส (mg/kg) |
| K | โพแทสเซียม (mg/kg) |
| pH | ความเป็นกรด-ด่าง |

#### ⚡ สถานะ Relay
- แสดง ON/OFF ของ Relay ทั้ง 12 ตัว
- สีเขียว = เปิด, สีเทา = ปิด

#### 🟢🔴 สถานะการเชื่อมต่อ
| สัญลักษณ์ | ความหมาย |
|----------|---------|
| 🟢 Node1 Connected | ESP32 Node1 ส่งข้อมูลปกติ |
| 🔴 Node1 Disconnected | ไม่ได้รับข้อมูลนาน >30 วิ |
| ⚡ Server Ready | Flask server พร้อมใช้งาน |

---

## 🎮 หน้า Control

**แท็บที่ 2** — ควบคุม Relay แบบ Manual และตั้งค่า Auto

### การควบคุม Manual
1. คลิกแท็บ **Control (ควบคุม)**
2. แต่ละ Relay มีปุ่ม **ON / OFF**
3. กดปุ่มเพื่อเปิด/ปิดอุปกรณ์ทันที

> ⚠️ **หมายเหตุ:** ถ้า Relay อยู่ในโหมด AUTO การกด Manual จะเปลี่ยนเป็น MANUAL ชั่วคราว

### การตั้งค่าโหมดอัตโนมัติ (ผ่านปุ่ม ⚙️)
1. กดปุ่ม **⚙️** ข้างชื่อ Relay
2. กล่องตั้งค่าจะปรากฏขึ้น
3. ตั้งค่าดังนี้:

| ช่อง | คำอธิบาย | ตัวอย่าง |
|------|---------|---------|
| Sensor | เลือก Sensor ที่ใช้ตรวจ | ดิน 1 แปลง 1 |
| เงื่อนไข | < (น้อยกว่า) หรือ > (มากกว่า) | < |
| ค่าเป้าหมาย | ตัวเลขที่ต้องการ | 50 |
| โหมด | MANUAL / AUTO | AUTO |

4. กด **บันทึก**

---

## 📈 หน้า Data

**แท็บที่ 3** — ตารางข้อมูลย้อนหลัง

### ฟีเจอร์
- แสดงข้อมูล Sensor ทุก 10 วินาที (จากฐานข้อมูล SQLite)
- กรองข้อมูลตามช่วงวันที่
- Export เป็น CSV ได้
- แสดง 100 รายการล่าสุดเป็น default

---

## 📊 หน้า Graph

**แท็บที่ 4** — กราฟข้อมูลย้อนหลัง

### ฟีเจอร์
- เลือก Sensor ที่ต้องการดู
- เลือกช่วงเวลา (1 ชั่วโมง / 6 ชั่วโมง / 24 ชั่วโมง / 7 วัน)
- กราฟ Line Chart แบบ Interactive

---

## 🤖 โหมดอัตโนมัติ

### วิธีเปิด AUTO MODE

**วิธีที่ 1: เปิดทีละ Relay**
1. ไปหน้า **Control**
2. กดปุ่ม **⚙️** ของ Relay ที่ต้องการ
3. เลือก Mode = **AUTO**
4. กด **บันทึก**

**วิธีที่ 2: ผ่านหน้า Automation Page**
1. ไปหน้า **Automation**
2. ตั้งค่า Sensor + เงื่อนไข + ค่าเป้าหมาย
3. เลือก AUTO แล้วบันทึก

---

### ตัวอย่างการตั้งค่า

#### ตัวอย่าง: เปิดวาล์วรดน้ำเมื่อดินแห้ง
```
Relay 6 (วาล์ว 1 แปลง 1)
  Sensor:     ดิน 1 แปลง 1 (SN-300SD)
  เงื่อนไข:    < (น้อยกว่า)
  ค่าเป้าหมาย: 50 %
  โหมด:       AUTO
```
**ผล:** เมื่อความชื้นดินต่ำกว่า 50% → วาล์วเปิด 60 วินาที → ปิด 10 วินาที → ทำซ้ำ

#### ตัวอย่าง: เปิดพัดลมเมื่ออากาศร้อน/ชื้น
```
Relay 1 (Fan)
  Sensor1:    อุณหภูมิ > 28°C
  Sensor2:    ความชื้นอากาศ > 75%
  Logic:      OR (อย่างใดอย่างหนึ่ง)
  โหมด:       AUTO
```
**ผล:** อุณหภูมิ >28°C **หรือ** ความชื้น >75% → พัดลมเปิด

---

### พฤติกรรมของ Relay แต่ละกลุ่ม

#### 🔵 กลุ่ม Binary (เปิด/ปิดทันที)
| Relay | อุปกรณ์ | พฤติกรรม |
|-------|---------|---------|
| 0 | ปั้มแปลง 1 | เปิด/ปิดทันทีเมื่อเงื่อนไขเปลี่ยน |
| 1 | พัดลม | เปิด/ปิดทันที (ตรวจ 2 sensor) |
| 2 | ไฟส่องสว่าง | เปิด/ปิดทันที |
| 3 | พ่นหมอก | เปิด/ปิดทันที |
| 4 | ปั้มแปลง 2 | เปิด/ปิดทันที |
| 5 | EvapPump | เปิด/ปิดทันที |

#### 🟡 กลุ่ม Pulse (เปิดสลับปิด — วาล์วน้ำ)
| Relay | อุปกรณ์ | พฤติกรรม |
|-------|---------|---------|
| 6 | วาล์ว 1 แปลง 1 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |
| 7 | วาล์ว 2 แปลง 1 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |
| 8 | วาล์ว 3 แปลง 1 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |
| 9 | วาล์ว 1 แปลง 2 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |
| 10 | วาล์ว 2 แปลง 2 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |
| 11 | วาล์ว 3 แปลง 2 | เปิด 60 วิ → ปิด 10 วิ → วนซ้ำ |

> **Pulse Mode** ป้องกันน้ำล้นแปลง โดยปล่อยน้ำเป็นรอบๆ จนกว่าดินจะชื้นพอ

---

## 🔌 Relay ทั้ง 12 ตัว

| หมายเลข | ชื่อ | Sensor ที่ใช้ตรวจ | ค่า Default | เงื่อนไข |
|---------|------|-----------------|------------|---------|
| Relay 0 | ปั้มแปลง 1 | ดิน 2 แปลง 1 (SN-3002) | 35% | < เปิด |
| Relay 1 | พัดลม | อุณหภูมิ / ความชื้นอากาศ | 28°C / 75% | > เปิด |
| Relay 2 | ไฟส่องสว่าง | แสง (Lux) | 200 lux | < เปิด |
| Relay 3 | พ่นหมอก | ความชื้นอากาศ | 60% | < เปิด |
| Relay 4 | ปั้มแปลง 2 | ดิน 2 แปลง 2 (Node3 S1) | 35% | < เปิด |
| Relay 5 | EvapPump | ดิน 2 แปลง 1 | 35% | < เปิด |
| Relay 6 | วาล์ว 1 แปลง 1 | ดิน 1 แปลง 1 (SN-300SD) | 50% | < เปิด |
| Relay 7 | วาล์ว 2 แปลง 1 | ดิน 3 แปลง 1 (Node3 S2) | 50% | < เปิด |
| Relay 8 | วาล์ว 3 แปลง 1 | ดิน 1 แปลง 2 (Node3 S3) | 50% | < เปิด |
| Relay 9 | วาล์ว 1 แปลง 2 | ดิน 2 แปลง 2 (Node3 S1) | 50% | < เปิด |
| Relay 10 | วาล์ว 2 แปลง 2 | ดิน 3 แปลง 2 (Node3 S4) | 50% | < เปิด |
| Relay 11 | วาล์ว 3 แปลง 2 | ดิน 3 แปลง 2 (Node3 S4) | 50% | < เปิด |

---

## 📡 Sensor ทั้งหมด

| ชื่อในระบบ | ชื่อแสดง | Node | หน่วย |
|-----------|---------|------|-------|
| `temp` | อุณหภูมิ | Node 1 | °C |
| `hum` | ความชื้นอากาศ | Node 1 | % |
| `lux` | แสง | Node 1 | lux |
| `co2` | CO₂ | Node 1 | ppm |
| `soil_hum` | ดิน 2 แปลง 1 (SN-3002) | Node 1 | % |
| `soil_moisture_1` | ดิน 1 แปลง 1 (SN-300SD) | Node 1 | % |
| `s1_hum` | ดิน 2 แปลง 2 (Node3 S1) | Node 3 | % |
| `s2_hum` | ดิน 3 แปลง 1 (Node3 S2) | Node 3 | % |
| `s3_hum` | ดิน 1 แปลง 2 (Node3 S3) | Node 3 | % |
| `s4_hum` | ดิน 3 แปลง 2 (Node3 S4) | Node 3 | % |
| `ph` | pH ดิน | Node 1 | - |
| `n` | ไนโตรเจน | Node 1 | mg/kg |
| `p` | ฟอสฟอรัส | Node 1 | mg/kg |
| `k` | โพแทสเซียม | Node 1 | mg/kg |

---

## 🔧 Node ESP32

### Node 1 — Sensor หลัก
- **หน้าที่:** ส่งข้อมูล Sensor (อุณหภูมิ, ความชื้น, แสง, CO₂, ดิน, NPK, pH)
- **MQTT Topic ส่ง:** `smartfarm/sensors`
- **ไฟล์:** `src/node1_sensor.cpp`

### Node 2 — Relay Control
- **หน้าที่:** รับคำสั่งเปิด/ปิด Relay 12 ตัว
- **MQTT Topic รับ:** `smartfarm/relay`
- **MQTT Topic ส่งสถานะ:** `smartfarm/relay/status`
- **ไฟล์:** `src/node2_relay.cpp`

### Node 3 — Soil Sensor เพิ่มเติม
- **หน้าที่:** ส่งข้อมูลความชื้นดิน 4 จุด (S1-S4)
- **MQTT Topic ส่ง:** `smartfarm/node3`
- **ไฟล์:** `src/node_3.cc`

---

## 🔄 การ Restart ระบบ

### Restart Flask API (หลัก)
```bash
sudo systemctl restart smartfarm-backend
```

### Restart Dashboard
```bash
sudo systemctl restart smartfarm-dashboard
```

### Restart ทุกอย่างพร้อมกัน
```bash
sudo systemctl restart mosquitto smartfarm-backend smartfarm-dashboard
```

### ดู Log แบบ Real-time
```bash
# Log Flask API
journalctl -u smartfarm-backend -f

# Log Dashboard
journalctl -u smartfarm-dashboard -f

# Log ทั้งหมด
journalctl -u smartfarm-backend -u smartfarm-dashboard -f
```

### ตรวจสอบสถานะ Services
```bash
systemctl status smartfarm-backend smartfarm-dashboard mosquitto
```

---

## 💾 การกู้คืน SD Card

### กรณีที่ SD Card พังและต้องเปลี่ยนใหม่

1. Flash **Raspberry Pi OS** ลง SD Card ใหม่
2. เชื่อมต่อ Wi-Fi / LAN
3. เปิด Terminal แล้วรัน:

```bash
curl -fsSL https://raw.githubusercontent.com/smartfarmkamalasai112-dev/Smart-Farmm/main/RECOVERY.sh | sudo bash
```

> สคริปต์จะถามหา **GitHub Token** (ghp_...) ของ account `smartfarmkamalasai112-dev`

**สิ่งที่สคริปต์ทำให้อัตโนมัติ:**
- ✅ ติดตั้ง python3, nodejs, mosquitto, git
- ✅ Clone โปรเจคจาก GitHub
- ✅ ติดตั้ง Python packages ทั้งหมด
- ✅ Build React Dashboard
- ✅ ตั้งค่า systemd services
- ✅ Restart และตรวจสอบระบบ

---

## 🛠️ แก้ปัญหาเบื้องต้น

### ❌ เว็บไม่โหลด
```bash
# ตรวจสอบว่า service รันอยู่ไหม
systemctl status smartfarm-dashboard

# ถ้าไม่รัน ให้ restart
sudo systemctl restart smartfarm-dashboard
```

### ❌ Sensor แสดง 0 หรือ -- ทั้งหมด
```bash
# ตรวจสอบว่า Flask API รันอยู่ไหม
systemctl status smartfarm-backend

# ตรวจสอบ MQTT
systemctl status mosquitto

# ดู log ว่า ESP32 ส่งข้อมูลมาไหม
journalctl -u smartfarm-backend -f | grep "MQTT\|sensor"
```

### ❌ Relay ไม่ทำงานในโหมด AUTO
```bash
# ดู log การประเมิน Auto Mode
journalctl -u smartfarm-backend -f | grep -E "Relay|AUTO|sensor_value"
```

ตรวจสอบ:
1. Relay อยู่ในโหมด AUTO หรือไม่?
2. Sensor ส่งค่ามาหรือไม่? (ตรวจจากหน้า Monitor)
3. ค่า Sensor เกินเงื่อนไขที่ตั้งไว้หรือไม่?

### ❌ พัดลม (Relay 1) ไม่ทำงาน
พัดลมใช้ **2 Sensor (Dual)** — ตรวจว่า:
- อุณหภูมิ > 28°C **หรือ**
- ความชื้นอากาศ > 75%
อย่างใดอย่างหนึ่งต้องเป็นจริง

### ❌ วาล์ว (Relay 6-11) เปิดแล้วปิดเร็วเกินไป
ปกติแล้ววาล์วจะทำงานแบบ **Pulse**:
- เปิด 60 วินาที → ปิด 10 วินาที → วนซ้ำ
- นี่คือพฤติกรรมปกติ ไม่ใช่ข้อผิดพลาด

### ❌ ESP32 ส่งข้อมูลแล้วแต่ Dashboard ไม่อัปเดต
```bash
# ทดสอบ MQTT โดยตรง
mosquitto_sub -h localhost -t "smartfarm/#" -v
```
ถ้าเห็นข้อมูลขึ้นมา → ปัญหาอยู่ที่ WebSocket/Frontend
ถ้าไม่เห็น → ปัญหาอยู่ที่ ESP32 หรือ MQTT Broker

---

## 📞 ข้อมูลสำคัญ

| รายการ | ค่า |
|--------|-----|
| GitHub | https://github.com/smartfarmkamalasai112-dev/Smart-Farmm |
| Raspberry Pi IP | 192.168.1.106 |
| Tailscale IP | 100.124.102.88 |
| Dashboard Port | 5005 |
| API Port | 5000 |
| MQTT Port | 1883 |
| MQTT WebSocket | 9001 |
| ไฟล์ Database | `/home/admin/.../MyWeb/smartfarm_myweb.db` |
| Log Flask | `journalctl -u smartfarm-backend` |

---

*อัปเดตล่าสุด: 10 มีนาคม 2026*
