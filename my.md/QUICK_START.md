# 🚀 Quick Start Guide - Smart Farm v2.0

## ⚡ 5-Minute Setup

### Backend (Python - Raspberry Pi)

```bash
cd MyWeb
bash setup.sh
python app.py
```

**Expected Output:**
```
✅ Database Initialized Successfully
✅ MQTT Connected with result code 0
🌐 Server starting on 0.0.0.0:5000...
```

### Frontend (React - Any machine)

```bash
cd smart-farm-dashboard
bash setup.sh
npm run dev
```

**Open in browser:** `http://100.119.101.9:3000` (or your dev port)

---

## 📋 Configuration Checklist

- [ ] Backend: Update `MQTT_BROKER` in `MyWeb/app.py` line 20
- [ ] Backend: Update `SERVER_IP` in `MyWeb/app.py` line 23
- [ ] Frontend: Update `SOCKET_URL` in `smart-farm-dashboard/src/App.jsx` line 15
- [ ] ESP32: Configure to publish to `smartfarm/sensors` topic
- [ ] Verify MQTT broker running: `sudo systemctl status mosquitto`

---

## 🧪 Quick Tests

### Test MQTT connectivity
```bash
mosquitto_sub -h localhost -t smartfarm/sensors
# Should see JSON data every 5 seconds from ESP32
```

### Test API
```bash
curl http://100.119.101.9:5000/api/data
# Should return current sensor state
```

### Test WebSocket
Open browser console (F12) and check for:
```
✅ Connected to Server
📡 Sensor Update: {...}
```

---

## 📊 What's New?

### ✨ v2.0 Features
- ✅ **SQLite Database** - Persistent data storage
- ✅ **Flask-SocketIO** - Zero-latency real-time updates
- ✅ **Dual Soil Sensors** - `soil_1` and `soil_2`
- ✅ **NPK Monitoring** - N, P, K levels in ppm
- ✅ **CO₂ Tracking** - Environmental monitoring
- ✅ **State Recovery** - Auto-restore on restart
- ✅ **Advanced UI** - 10 metric cards + graph
- ✅ **Error Handling** - Comprehensive logging

### 📈 Data Structure
```json
{
  "air": { "temp": 28.5, "hum": 60.2 },
  "soil_1": { "hum": 45.0, "ph": 6.5, "n": 100, "p": 50, "k": 120 },
  "soil_2": { "hum": 42.5 },
  "env": { "lux": 1500, "co2": 400 }
}
```

---

## 🔌 MQTT Topics

### Input (ESP32 → Backend)
- **Topic:** `smartfarm/sensors`
- **Frequency:** Every 5 seconds
- **Payload:** JSON (see above)

### Output (Backend → ESP32)
- **Topic:** `smartfarm/control`
- **Payload:** `{"index": 0, "value": true}`

---

## 🎨 UI Components

### Home Page Layout
```
┌─ HEADER ──────────────────────────┐
│ 🌱 Smart Farm    ONLINE 🟢       │
└───────────────────────────────────┘

┌─ SENSOR CARDS (4 cols) ───────────┐
│ 🌡️ Temp    💧 Humidity          │
│ 🌱 Soil-1  ☀️ Lux              │
└───────────────────────────────────┘

┌─ METRICS GRID (6 cols) ───────────┐
│ pH  │ N  │ P  │ K  │ CO₂ │ Soil-2│
└───────────────────────────────────┘

┌─ GRAPH (4 lines) ─────────────────┐
│ Temp, Air Hum, Soil-1, Soil-2    │
└───────────────────────────────────┘

┌─ RELAY CONTROL ───────────────────┐
│ [OFF] [ON]  [OFF] [ON]            │
│ R1    R2    R3    R4              │
└───────────────────────────────────┘
```

---

## 📱 Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Full | Recommended |
| Firefox | ✅ Full | Recommended |
| Safari | ✅ Full | May need CORS setup |
| Edge | ✅ Full | Recommended |

---

## 🐛 Common Issues & Fixes

### "OFFLINE 🔴"
- Check backend is running: `ps aux | grep python`
- Check firewall: `sudo ufw allow 5000`
- Check IP in App.jsx matches server IP

### No sensor data
- Check MQTT publishing: `mosquitto_sub -t smartfarm/sensors`
- Verify JSON matches new schema
- Check MQTT broker: `sudo systemctl status mosquitto`

### Relays won't toggle
- Check `/api/control` endpoint responds
- Verify MQTT publish to `smartfarm/control`
- Check ESP32 relay code

### Graph won't update
- Need at least 2 data points (check console)
- Verify sensor_update event (browser DevTools)
- Check timestamp format

---

## 📦 File Structure

```
SmartFarmMQTT/
├── MyWeb/
│   ├── app.py ⭐ (Backend - 396 lines)
│   ├── requirements.txt
│   ├── setup.sh
│   ├── smartfarm-backend.service
│   └── smartfarm.db (auto-created)
│
├── smart-farm-dashboard/
│   ├── src/
│   │   └── App.jsx ⭐ (Frontend - 581 lines)
│   ├── package.json
│   ├── setup.sh
│   └── vite.config.js
│
├── src/
│   ├── node1_sensor.cpp
│   └── node2_relay.cpp
│
├── platformio.ini
├── .cursorrules
├── UPGRADE_GUIDE.md
└── QUICK_START.md (this file)
```

---

## 🚀 Production Deployment

### Backend (systemd service)
```bash
sudo cp MyWeb/smartfarm-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable smartfarm-backend
sudo systemctl start smartfarm-backend
```

### Frontend (Production build)
```bash
cd smart-farm-dashboard
npm run build
# Serves from dist/ folder
npm run preview
```

---

## 📊 Database Backup

```bash
# Backup
cp MyWeb/smartfarm.db MyWeb/smartfarm.db.backup

# Restore
cp MyWeb/smartfarm.db.backup MyWeb/smartfarm.db

# Query data
sqlite3 MyWeb/smartfarm.db "SELECT * FROM sensors LIMIT 10;"
```

---

## 🔒 Security Notes

- ✅ CORS enabled for all origins (dev only - restrict in production)
- ✅ MQTT QoS 1 for reliability
- ✅ Thread-safe state management
- ⚠️ No authentication (add in production)
- ⚠️ No HTTPS (add SSL in production)

---

## 📞 Debugging

### Enable verbose logging
```python
# In app.py, change:
logging.basicConfig(level=logging.DEBUG)
```

### Monitor MQTT traffic
```bash
mosquitto_sub -h localhost -t "smartfarm/#" -v
```

### Check database size
```bash
ls -lh MyWeb/smartfarm.db
```

### View recent logs
```bash
sqlite3 MyWeb/smartfarm.db "SELECT timestamp, COUNT(*) FROM sensors GROUP BY DATE(timestamp);"
```

---

## 🎓 Learning Resources

- [Flask-SocketIO Docs](https://python-socketio.readthedocs.io/)
- [React Hooks Guide](https://react.dev/reference/react/hooks)
- [SQLite Tutorial](https://www.sqlite.org/lang.html)
- [MQTT Protocol](https://mqtt.org/)
- [Recharts Documentation](https://recharts.org/)

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Backend starts without errors
- [ ] Frontend shows "ONLINE 🟢"
- [ ] Sensor data updates in real-time
- [ ] Relay buttons toggle
- [ ] Graph displays 4 lines
- [ ] No browser console errors
- [ ] Database file created (`smartfarm.db`)
- [ ] MQTT communication working

---

## 🎉 You're All Set!

Your Smart Farm system is now running on **SQLite + SocketIO** with:
- ✅ Zero-latency real-time updates
- ✅ Persistent data storage
- ✅ Beautiful modern UI
- ✅ Professional error handling
- ✅ Production-ready architecture

**Next Steps:**
1. Monitor system performance
2. Collect historical data
3. Add automation rules
4. Deploy to production
5. Scale to multiple farms

---

**Version**: 2.0  
**Last Updated**: February 13, 2026  
**Status**: ✅ Ready to Deploy
