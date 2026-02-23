# Flask Auto-Restart Setup Guide

## Overview
The `restart-flask.sh` script automatically monitors the Flask backend server and restarts it if it crashes. This is especially useful when:
- The Raspberry Pi loses power and restarts
- The Flask process crashes unexpectedly
- You need the dashboard to be highly available

## Setup Instructions

### 1. Make the Script Executable
The script is already made executable. To verify:
```bash
ls -la MyWeb/restart-flask.sh
# Should show: -rwxr-xr-x
```

### 2. Run the Script

#### Option A: Run Directly in Terminal
```bash
cd ~/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
./restart-flask.sh
```

#### Option B: Run as Background Service (Recommended)
```bash
# Using nohup (standard method)
cd ~/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
nohup ./restart-flask.sh > /tmp/flask-restart.log 2>&1 &

# Or using systemd service (see below)
```

#### Option C: Create a Systemd Service (Most Robust)

Create `/etc/systemd/system/smartfarm-flask-restart.service`:
```ini
[Unit]
Description=Smart Farm Flask Auto-Restart
After=network.target

[Service]
Type=simple
User=admin
WorkingDirectory=/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
ExecStart=/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb/restart-flask.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable smartfarm-flask-restart.service
sudo systemctl start smartfarm-flask-restart.service
```

Check status:
```bash
sudo systemctl status smartfarm-flask-restart.service
```

### 3. Monitor the Script

#### View Real-time Logs
```bash
tail -f /tmp/flask-restart.log
```

#### Watch Flask Process
```bash
watch -n 2 'ps aux | grep app.py'
```

## Features

✅ **Continuous Monitoring**: Checks Flask every 5 seconds
✅ **Auto-Restart**: Automatically restarts if Flask crashes
✅ **Graceful Shutdown**: Handles SIGTERM and SIGINT signals
✅ **Detailed Logging**: Comprehensive logs in `/tmp/flask-restart.log`
✅ **Failure Protection**: Stops after 10 consecutive failures to prevent infinite restart loop
✅ **Virtual Environment Support**: Automatically activates venv if present
✅ **Colored Output**: Easy-to-read console output with color codes

## How It Works

1. **Start**: Launches Flask server as background process
2. **Monitor**: Checks every 5 seconds if Flask process is still running
3. **Detect**: If Flask crashes, detects within ~5 seconds
4. **Restart**: Waits 5 seconds, then attempts to restart
5. **Repeat**: Continues monitoring and restarting indefinitely
6. **Failure Handling**: After 10 consecutive failures, gives up to prevent system resource exhaustion

## What to Do When Backend Goes Down

### Dashboard Behavior:
1. Connection indicator turns red/orange
2. Shows "Connection Error" message
3. Socket.IO automatically attempts to reconnect
4. Once Flask is restarted, dashboard automatically reconnects

### Manual Recovery:
If the auto-restart script is not running:
```bash
cd ~/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb

# Kill any existing Flask processes
pkill -f "python app.py"

# Restart manually
./restart-flask.sh
```

## Troubleshooting

### Script won't start
```bash
# Check if it's executable
ls -la MyWeb/restart-flask.sh

# Make it executable if needed
chmod +x MyWeb/restart-flask.sh

# Check Python path
which python
which python3
```

### Flask not restarting
```bash
# Check logs
tail -f /tmp/flask-restart.log

# Check if port 5000 is in use
lsof -i :5000

# Kill and restart
pkill -f restart-flask.sh
pkill -f "python app.py"
./restart-flask.sh
```

### High CPU usage
This usually means Flask is repeatedly crashing. Check logs:
```bash
tail -50 /tmp/flask-restart.log
```

## Integration with Dashboard

The React dashboard now has improved Socket.IO reconnection logic:
- **reconnectionAttempts**: Set to Infinity (will keep trying forever)
- **reconnectionDelay**: 1-5 seconds between attempts
- **Connection Status Bar**: Shows real-time connection state (green/orange/red)
- **Error Messages**: User-friendly feedback when backend is unavailable

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│   React Dashboard (Port 5173)           │
│   - Socket.IO reconnection logic        │
│   - Connection status indicator         │
└──────────────────┬──────────────────────┘
                   │ WebSocket + Polling
                   │
┌──────────────────▼──────────────────────┐
│   Flask Backend (Port 5000)             │
│   - API endpoints (/api/status, etc)    │
│   - Real-time sensor updates            │
│   - Relay control                       │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│   restart-flask.sh Script               │
│   - Monitors Flask process              │
│   - Auto-restarts on crash              │
│   - Detailed logging                    │
└─────────────────────────────────────────┘
```

## Summary

With this setup:
- ✅ Flask auto-starts on boot (if using systemd)
- ✅ Flask auto-restarts when it crashes
- ✅ Dashboard gracefully handles connection loss
- ✅ Dashboard auto-reconnects when Flask recovers
- ✅ System is resilient to power outages and unexpected failures
