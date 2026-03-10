#!/bin/bash
# ============================================================
#  SMART FARM - SD CARD RECOVERY SCRIPT
#  ใช้เมื่อ SD Card พัง / เปลี่ยน SD Card ใหม่
#  วันที่สร้าง: 10/03/2026
#  GitHub: https://github.com/smartfarmkamalasai112-dev/Smart-Farmm
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
header() { echo -e "\n${BLUE}============================================================${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}============================================================${NC}"; }

# ============================================================
# STEP 0: ตรวจสอบว่า run เป็น root
# ============================================================
if [ "$EUID" -ne 0 ]; then
  error "กรุณา run ด้วย sudo: sudo bash RECOVERY.sh"
fi

header "SMART FARM RECOVERY - เริ่มต้น"
echo "Raspberry Pi IP: $(hostname -I | awk '{print $1}')"
echo "Date: $(date)"

# ============================================================
# STEP 1: อัปเดตระบบและติดตั้ง packages หลัก
# ============================================================
header "STEP 1: ติดตั้ง System Packages"

apt-get update -y
apt-get install -y \
  git \
  python3 \
  python3-pip \
  mosquitto \
  mosquitto-clients \
  curl \
  wget \
  net-tools \
  fuser 2>/dev/null || true

# ติดตั้ง Node.js 20
if ! command -v node &>/dev/null; then
  warn "ติดตั้ง Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
log "Node.js: $(node --version)"
log "npm: $(npm --version)"
log "Python3: $(python3 --version)"

# ============================================================
# STEP 2: สร้าง user admin (ถ้ายังไม่มี)
# ============================================================
header "STEP 2: ตั้งค่า User"

if ! id "admin" &>/dev/null; then
  useradd -m -s /bin/bash admin
  echo "admin:admin" | chpasswd
  usermod -aG sudo admin
  log "สร้าง user admin เรียบร้อย"
else
  log "user admin มีอยู่แล้ว"
fi

# ============================================================
# STEP 3: Clone โปรเจคจาก GitHub
# ============================================================
header "STEP 3: Clone โปรเจคจาก GitHub"

PROJECT_DIR="/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain"
REPO_URL="https://github.com/smartfarmkamalasai112-dev/Smart-Farmm.git"

mkdir -p /home/admin/PlatformIOProjects/SmartFarmMQTT-main

if [ -d "$PROJECT_DIR" ]; then
  warn "โฟลเดอร์มีอยู่แล้ว - จะ pull แทน"
  cd "$PROJECT_DIR"
  git pull origin main || warn "git pull ล้มเหลว - ข้ามต่อ"
else
  warn "กรุณาใส่ GitHub Token สำหรับ smartfarmkamalasai112-dev"
  read -p "Token (ghp_...): " GH_TOKEN
  git clone "https://smartfarmkamalasai112-dev:${GH_TOKEN}@github.com/smartfarmkamalasai112-dev/Smart-Farmm.git" "$PROJECT_DIR"
  log "Clone เรียบร้อย"
fi

chown -R admin:admin /home/admin/PlatformIOProjects/

# ============================================================
# STEP 4: ติดตั้ง Python packages
# ============================================================
header "STEP 4: ติดตั้ง Python Packages"

pip3 install --break-system-packages \
  flask==3.0.0 \
  flask-cors==4.0.0 \
  flask-socketio==5.3.5 \
  python-socketio==5.10.0 \
  paho-mqtt==2.1.0 \
  eventlet==0.40.4 \
  python-engineio==4.8.0 \
  simple-websocket

log "Python packages ติดตั้งเรียบร้อย"

# ============================================================
# STEP 5: ตั้งค่า Mosquitto MQTT Broker
# ============================================================
header "STEP 5: ตั้งค่า Mosquitto MQTT"

cat > /etc/mosquitto/mosquitto.conf << 'EOF'
listener 1883
allow_anonymous true
listener 9001
protocol websockets
allow_anonymous true
EOF

systemctl enable mosquitto
systemctl restart mosquitto
log "Mosquitto เริ่มต้นเรียบร้อย"

# ============================================================
# STEP 6: Build React Dashboard
# ============================================================
header "STEP 6: Build React Dashboard"

DASHBOARD_DIR="$PROJECT_DIR/smart-farm-dashboard"

if [ -d "$DASHBOARD_DIR" ]; then
  cd "$DASHBOARD_DIR"
  npm install
  npm run build
  log "Dashboard build เรียบร้อย"
else
  warn "ไม่พบโฟลเดอร์ smart-farm-dashboard"
fi

# ============================================================
# STEP 7: ตั้งค่า systemd Services
# ============================================================
header "STEP 7: ตั้งค่า Systemd Services"

# --- smartfarm-backend.service (Flask API port 5000) ---
cat > /etc/systemd/system/smartfarm-backend.service << EOF
[Unit]
Description=Smart Farm Flask Backend
After=network.target mosquitto.service

[Service]
User=admin
WorkingDirectory=$PROJECT_DIR/MyWeb
ExecStartPre=/bin/sh -c 'fuser -k 5000/tcp 2>/dev/null; true'
ExecStartPre=/bin/sleep 1
ExecStart=/usr/bin/python3 app.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# --- smartfarm-dashboard.service (Dashboard port 5005) ---
cat > /etc/systemd/system/smartfarm-dashboard.service << EOF
[Unit]
Description=Smart Farm React Dashboard
After=network.target smartfarm-backend.service

[Service]
User=admin
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/python3 serve_dashboard.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# --- smartfarm-backup.service (Database backup) ---
cat > /etc/systemd/system/smartfarm-backup.service << EOF
[Unit]
Description=SmartFarm Database Continuous Backup Service
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=admin
WorkingDirectory=$PROJECT_DIR/Database
ExecStartPre=/bin/bash -c "pkill -f 'python3.*continuous_backup' || true"
ExecStart=/usr/bin/python3 $PROJECT_DIR/Database/continuous_backup.py
Restart=always
RestartSec=10
KillMode=control-group
StandardOutput=append:/tmp/smartfarm_backup.log
StandardError=append:/tmp/smartfarm_backup.log
Environment="PYTHONUNBUFFERED=1"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable smartfarm-backend smartfarm-dashboard smartfarm-backup
systemctl restart smartfarm-backend smartfarm-dashboard smartfarm-backup

log "Services เริ่มต้นเรียบร้อย"

# ============================================================
# STEP 8: ตรวจสอบระบบ
# ============================================================
header "STEP 8: ตรวจสอบระบบ"

sleep 3

check_service() {
  if systemctl is-active --quiet "$1"; then
    log "Service $1: ✅ RUNNING"
  else
    warn "Service $1: ❌ NOT RUNNING"
    journalctl -u "$1" --no-pager -n 10
  fi
}

check_service mosquitto
check_service smartfarm-backend
check_service smartfarm-dashboard

# ตรวจสอบ port
sleep 2
if nc -z localhost 5000 2>/dev/null; then
  log "Port 5000 (Flask API): ✅ OPEN"
else
  warn "Port 5000 (Flask API): ❌ ไม่ตอบสนอง"
fi

if nc -z localhost 5005 2>/dev/null; then
  log "Port 5005 (Dashboard): ✅ OPEN"
else
  warn "Port 5005 (Dashboard): ❌ ไม่ตอบสนอง"
fi

if nc -z localhost 1883 2>/dev/null; then
  log "Port 1883 (MQTT): ✅ OPEN"
else
  warn "Port 1883 (MQTT): ❌ ไม่ตอบสนอง"
fi

# ============================================================
# DONE
# ============================================================
header "✅ RECOVERY เสร็จสมบูรณ์!"

IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "  ${GREEN}Dashboard:${NC}   http://$IP:5005"
echo -e "  ${GREEN}Flask API:${NC}   http://$IP:5000"
echo -e "  ${GREEN}MQTT Broker:${NC} $IP:1883"
echo ""
echo -e "  ${YELLOW}คำสั่งตรวจสอบ log:${NC}"
echo "  journalctl -u smartfarm-backend -f"
echo "  journalctl -u smartfarm-dashboard -f"
echo ""
