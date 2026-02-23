# ✅ Smart Farm v2.0 - Pre-Deployment Checklist

## 🔧 Pre-Installation Requirements

### System Requirements
- [ ] Raspberry Pi 4+ or Linux server
- [ ] Python 3.8 or higher installed
- [ ] Node.js 16+ installed
- [ ] MQTT broker (Mosquitto) installed
- [ ] ESP32 microcontroller flashed
- [ ] Network connectivity (all devices on same network)

### Software Prerequisites
```bash
# Check Python
python3 --version  # Should be 3.8+

# Check Node.js
node --version  # Should be 16+
npm --version

# Check MQTT Broker
sudo systemctl status mosquitto  # Should be running

# Check network access
ping 100.119.101.9  # Replace with your server IP
```

---

## 📥 Installation Checklist

### Backend Installation

- [ ] Extract project to `/home/pi/SmartFarmMQTT` (or your preferred path)
- [ ] Navigate to backend: `cd MyWeb`
- [ ] Run setup script: `bash setup.sh`
- [ ] Activate virtual environment (if created):
  ```bash
  source venv/bin/activate
  ```
- [ ] Verify dependencies:
  ```bash
  pip list | grep -E "flask|socketio|mqtt|eventlet"
  ```
- [ ] Edit configuration:
  ```bash
  nano app.py
  # Update lines 18-24:
  # - MQTT_BROKER = "localhost" or your broker IP
  # - SERVER_IP = "100.119.101.9" or your server IP
  # - SERVER_PORT = 5000
  ```
- [ ] Test database creation:
  ```bash
  python app.py &
  sleep 5
  ls -la smartfarm.db
  pkill -f "python app.py"
  ```

### Frontend Installation

- [ ] Navigate to frontend: `cd smart-farm-dashboard`
- [ ] Run setup script: `bash setup.sh`
- [ ] Edit configuration:
  ```bash
  nano src/App.jsx
  # Update line 15:
  # const SOCKET_URL = "http://100.119.101.9:5000";
  ```
- [ ] Test build:
  ```bash
  npm run build
  # Should complete without errors
  ```

---

## 🧪 Pre-Deployment Tests

### MQTT Connectivity Test

```bash
# Terminal 1: Subscribe to sensor topic
mosquitto_sub -h localhost -t smartfarm/sensors -v

# Terminal 2: Publish test data
mosquitto_pub -h localhost -t smartfarm/sensors -m '{
  "air": {"temp": 28.5, "hum": 60},
  "soil_1": {"hum": 45, "ph": 6.5, "n": 100, "p": 50, "k": 120},
  "soil_2": {"hum": 42.5},
  "env": {"lux": 1500, "co2": 400}
}'

# Verify: Should see message in Terminal 1
- [ ] MQTT connection successful
- [ ] Message format correct
- [ ] JSON parsing works
```

### Backend Service Test

```bash
# Start backend
cd MyWeb
python app.py

# Expected output:
# ✅ Database Initialized Successfully
# 🔄 Loading last known state from database...
# ✅ MQTT Connected with result code 0
# 🌐 Server starting on 0.0.0.0:5000...

# In another terminal, test API:
curl http://localhost:5000/
curl http://localhost:5000/api/data
curl http://localhost:5000/api/status

- [ ] Server starts without errors
- [ ] APIs respond with valid JSON
- [ ] No Python exceptions in logs
- [ ] Database file created
```

### Frontend Service Test

```bash
# Start frontend (in another terminal)
cd smart-farm-dashboard
npm run dev

# Expected output:
# VITE v7.x.x  ready in XXX ms
# ➜  Local:   http://localhost:5173/
# ➜  Press q to quit

# Open browser to localhost:5173
- [ ] Frontend starts without errors
- [ ] Browser console shows no errors
- [ ] Webpack build completes
- [ ] No package dependency issues
```

### WebSocket Connection Test

```
Open browser DevTools (F12) → Console Tab

Expected logs:
✅ Connected to Server
📡 Sensor Update: {...}

- [ ] SocketIO connection established
- [ ] Console shows connection message
- [ ] No CORS errors
- [ ] No connection refused errors
```

---

## 🔌 Hardware Configuration

### ESP32 Firmware Requirements

- [ ] ESP32 configured with WiFi credentials
- [ ] MQTT broker IP set correctly in firmware
- [ ] MQTT topic set to: `smartfarm/sensors`
- [ ] Sensor calibration complete
- [ ] Publishing frequency: 5 seconds
- [ ] JSON payload format matches spec:
  ```json
  {
    "air": { "temp": XX.X, "hum": XX.X },
    "soil_1": { "hum": XX.X, "ph": X.X, "n": XXX, "p": XXX, "k": XXX },
    "soil_2": { "hum": XX.X },
    "env": { "lux": XXXX, "co2": XXX }
  }
  ```
- [ ] Relay control configured on GPIO pins
- [ ] Subscribed to topic: `smartfarm/control`

### Network Configuration

- [ ] All devices on same WiFi network
- [ ] Server IP consistent (not changing)
- [ ] Firewall allows port 5000 (backend)
- [ ] Firewall allows port 3000/5173 (frontend dev)
- [ ] Firewall allows port 1883 (MQTT)
- [ ] No IP address conflicts

---

## 📊 Data Flow Verification

### Test 1: Sensor Data → Database → UI

```
Step 1: ESP32 publishes data
mosquitto_pub -h localhost -t smartfarm/sensors -m '...'

Step 2: Backend receives and saves
- Check app.py logs for "📡 Sensor Data Received"
- [ ] Backend received message

Step 3: Frontend updates
- Open browser console
- Should see "📡 Sensor Update: {...}"
- [ ] Frontend received data

Step 4: Verify database
sqlite3 MyWeb/smartfarm.db "SELECT COUNT(*) FROM sensors;"
- [ ] Data saved to database
```

### Test 2: Relay Control → Backend → ESP32

```
Step 1: Click relay button in UI
- [ ] Relay button toggles immediately (optimistic)

Step 2: Check API call
- Browser DevTools → Network
- Should see POST to /api/control
- [ ] API request sent

Step 3: Verify backend
- Check app.py logs for "🔌 Relay X set to Y"
- [ ] Backend processed command

Step 4: Check MQTT broadcast
mosquitto_sub -h localhost -t smartfarm/control -v
- Should see relay command
- [ ] MQTT message published
```

---

## 🚨 Common Issues - Pre-Deployment

### Issue: "ModuleNotFoundError: No module named 'flask'"
```bash
# Solution: Install dependencies
pip install -r MyWeb/requirements.txt
- [ ] Fixed
```

### Issue: "Connection refused" in frontend
```bash
# Check backend is running
ps aux | grep python
# Check IP in App.jsx
grep SOCKET_URL smart-farm-dashboard/src/App.jsx
# Check firewall
sudo ufw status
- [ ] Fixed
```

### Issue: "MQTT Connection failed"
```bash
# Check MQTT broker
sudo systemctl status mosquitto
# Check broker IP in app.py
grep MQTT_BROKER MyWeb/app.py
# Test connection
mosquitto_sub -h localhost -t test
- [ ] Fixed
```

### Issue: "Database locked"
```bash
# Ensure only one instance running
pkill -f "python app.py"
# Check file permissions
ls -la MyWeb/smartfarm.db
# Try removing and recreating
rm MyWeb/smartfarm.db
python MyWeb/app.py
- [ ] Fixed
```

### Issue: "No data in graph"
```bash
# Need at least 2 data points
# Wait 10+ seconds
# Check browser console for errors
# Verify MQTT is publishing: mosquitto_sub -t smartfarm/sensors
- [ ] Fixed
```

---

## 📋 Configuration Verification Checklist

### Backend Configuration (MyWeb/app.py)

Line 20:
```python
MQTT_BROKER = "localhost"  # ✅ Change if broker on different machine
```
- [ ] Correct IP/hostname

Line 23:
```python
SERVER_IP = "100.119.101.9"  # ✅ Your server IP
```
- [ ] Correct IP address

Line 24:
```python
SERVER_PORT = 5000  # ✅ Available port
```
- [ ] Port not in use

### Frontend Configuration (smart-farm-dashboard/src/App.jsx)

Line 15:
```javascript
const SOCKET_URL = "http://100.119.101.9:5000";  // ✅ Match backend
```
- [ ] Correct server IP and port

Line 16:
```javascript
const MAX_HISTORY_POINTS = 50;  // ✅ Graph data limit
```
- [ ] Reasonable value

### Database Configuration (MyWeb/app.py)

Line 19:
```python
DB_NAME = "smartfarm.db"  # ✅ Writable location
```
- [ ] Path accessible and writable

---

## 🟢 Go/No-Go Decision

### Deployment Can Proceed If:

- [x] All backend tests passed
- [x] All frontend tests passed
- [x] All WebSocket tests passed
- [x] Database operations working
- [x] MQTT communication verified
- [x] Configuration verified
- [x] No critical errors in logs
- [x] Network connectivity confirmed
- [x] ESP32 firmware compatible
- [x] All hardware connected

### Do NOT Deploy If:

- ❌ Backend fails to start
- ❌ Frontend shows connection errors
- ❌ MQTT broker not responding
- ❌ Database permission errors
- ❌ Port conflicts detected
- ❌ Network connectivity issues
- ❌ Configuration files incomplete
- ❌ Critical errors in logs

---

## 🚀 Deployment Steps (When Ready)

### Step 1: Start Backend Service

```bash
# Option A: Development (for testing)
cd MyWeb
python app.py

# Option B: Production (systemd service)
sudo systemctl start smartfarm-backend
sudo systemctl status smartfarm-backend
```

### Step 2: Start Frontend

```bash
# Option A: Development server
cd smart-farm-dashboard
npm run dev

# Option B: Production build
npm run build
npm run preview
```

### Step 3: Start ESP32

- Flash firmware with WiFi credentials
- Reset device
- Verify MQTT publishing to `smartfarm/sensors`

### Step 4: Verify Full System

```bash
# Monitor backend logs
tail -f /tmp/smartfarm.log

# Monitor MQTT traffic
mosquitto_sub -t "smartfarm/#" -v

# Check database growth
watch -n 5 'sqlite3 MyWeb/smartfarm.db "SELECT COUNT(*) FROM sensors;"'

# Open frontend in browser
# Navigate to http://100.119.101.9:3000
```

---

## 📈 Post-Deployment Monitoring

### Daily Checks

- [ ] Backend service running: `systemctl status smartfarm-backend`
- [ ] Database size: `du -h MyWeb/smartfarm.db`
- [ ] Log errors: `journalctl -u smartfarm-backend --since today`
- [ ] Memory usage: `ps aux | grep python`
- [ ] Network status: `netstat -tuln | grep 5000`

### Weekly Checks

- [ ] Backup database: `cp MyWeb/smartfarm.db backup/`
- [ ] Verify historical data: `sqlite3 MyWeb/smartfarm.db "SELECT DATE(timestamp), COUNT(*) FROM sensors GROUP BY DATE(timestamp);"`
- [ ] Check relay operation logs
- [ ] Verify graph data quality

### Monthly Checks

- [ ] Database optimization: `sqlite3 MyWeb/smartfarm.db "VACUUM;"`
- [ ] Archive old data if needed
- [ ] Review system performance metrics
- [ ] Plan capacity upgrades if necessary

---

## 🔒 Security Post-Deployment

- [ ] Change default CORS settings if going public
- [ ] Add HTTPS/SSL certificates
- [ ] Implement authentication (JWT tokens)
- [ ] Add rate limiting
- [ ] Enable firewall rules
- [ ] Regularly update dependencies
- [ ] Monitor for security vulnerabilities

---

## 📞 Support Information

If issues occur during deployment:

1. **Check logs:**
   ```bash
   tail -50 app logs
   tail -50 browser console
   ```

2. **Restart services:**
   ```bash
   pkill -f "python app.py"
   pkill -f "npm run"
   # Then restart
   ```

3. **Reset database (if needed):**
   ```bash
   rm MyWeb/smartfarm.db
   python MyWeb/app.py
   ```

4. **Verify MQTT:**
   ```bash
   mosquitto_sub -t smartfarm/sensors
   ```

---

## ✅ Final Verification

Before marking as "deployed," verify:

- [x] Backend responding to all API endpoints
- [x] Frontend displaying real-time data
- [x] Database growing with new records
- [x] Relay control functional
- [x] Graph showing 4-line chart
- [x] No console errors in browser
- [x] No exceptions in backend logs
- [x] MQTT messages flowing
- [x] System stable for 5+ minutes
- [x] All metrics showing correctly

---

**Deployment Date**: _______________  
**Deployer**: _______________  
**Status**: ⭕ Ready / 🟢 Deployed / 🔴 Issues

**Sign-off**: _______________

---

**Version**: 2.0  
**Last Updated**: February 13, 2026
