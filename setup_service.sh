#!/bin/bash

# ============================================================================
# SmartFarm Flask Backend - Systemd Service Setup Script
# ============================================================================
# Purpose: Automatically create and start a systemd service for Flask backend
# Location: /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/setup_service.sh
# Run as: sudo bash setup_service.sh
# ============================================================================

set -e  # Exit on any error

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║          SmartFarm Flask Backend - Systemd Service Setup               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain"
APP_DIR="${PROJECT_DIR}/MyWeb"
APP_FILE="${APP_DIR}/app.py"
SERVICE_NAME="smartfarm"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
USER="admin"
WORK_DIR="${APP_DIR}"

# ============================================================================
# STEP 1: Check if running as root (required for systemd operations)
# ============================================================================
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ ERROR: This script must be run as root (use: sudo bash setup_service.sh)${NC}"
   exit 1
fi

echo -e "${BLUE}[1/6]${NC} Checking prerequisites..."
echo "  • User: $USER"
echo "  • Project Directory: $PROJECT_DIR"
echo "  • App File: $APP_FILE"
echo ""

# Verify app.py exists
if [[ ! -f "$APP_FILE" ]]; then
    echo -e "${RED}❌ ERROR: app.py not found at $APP_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} app.py found"

# ============================================================================
# STEP 2: Stop any currently running Flask processes
# ============================================================================
echo ""
echo -e "${BLUE}[2/6]${NC} Stopping any running Flask processes..."

# Kill any existing Flask app.py processes
if pgrep -f "python3.*app.py" > /dev/null; then
    echo "  • Found running Flask processes, killing..."
    pkill -f "python3.*app.py" || true
    sleep 2
    echo -e "${GREEN}✓${NC} Flask processes stopped"
else
    echo "  • No running Flask processes found"
fi

# ============================================================================
# STEP 3: Create systemd service file
# ============================================================================
echo ""
echo -e "${BLUE}[3/6]${NC} Creating systemd service file..."
echo "  • Service file: $SERVICE_FILE"

cat > "$SERVICE_FILE" << 'SYSTEMD_EOF'
[Unit]
Description=SmartFarm Flask Backend - IoT Control System
Documentation=http://smartfarm.local
After=network.target mqtt.service
Wants=mqtt.service

[Service]
Type=simple
User=admin
Group=admin
WorkingDirectory=/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb
ExecStart=/usr/bin/python3 /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb/app.py

# Restart policy: Always restart on failure, with 10 second delay
Restart=on-failure
RestartSec=10

# Process management
StandardOutput=journal
StandardError=journal
SyslogIdentifier=smartfarm-flask

# Resource limits (optional - adjust if needed)
# LimitNOFILE=65536
# LimitNPROC=4096

# Security settings
PrivateTmp=yes
NoNewPrivileges=yes

# Keep process running even after user logout
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

if [[ -f "$SERVICE_FILE" ]]; then
    echo -e "${GREEN}✓${NC} Service file created successfully"
    echo ""
    echo "  Service file contents:"
    sed 's/^/    /' "$SERVICE_FILE"
else
    echo -e "${RED}❌ ERROR: Failed to create service file${NC}"
    exit 1
fi

# ============================================================================
# STEP 4: Reload systemd daemon and verify service
# ============================================================================
echo ""
echo -e "${BLUE}[4/6]${NC} Reloading systemd daemon..."

systemctl daemon-reload

if systemctl list-unit-files | grep -q "^${SERVICE_NAME}"; then
    echo -e "${GREEN}✓${NC} Service registered with systemd"
else
    echo -e "${RED}❌ ERROR: Service not registered${NC}"
    exit 1
fi

# ============================================================================
# STEP 5: Enable service on boot
# ============================================================================
echo ""
echo -e "${BLUE}[5/6]${NC} Enabling service on boot..."

systemctl enable "${SERVICE_NAME}.service"

if systemctl is-enabled "${SERVICE_NAME}.service" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Service enabled on boot"
else
    echo -e "${RED}❌ ERROR: Failed to enable service${NC}"
    exit 1
fi

# ============================================================================
# STEP 6: Start the service
# ============================================================================
echo ""
echo -e "${BLUE}[6/6]${NC} Starting Flask backend service..."

systemctl start "${SERVICE_NAME}.service"

# Wait a moment for service to start
sleep 3

# Check if service is running
if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    echo -e "${GREEN}✓${NC} Service started successfully"
else
    echo -e "${YELLOW}⚠${NC}  Service may not have started, checking logs..."
    echo ""
    echo "  Recent service logs:"
    journalctl -u "${SERVICE_NAME}.service" -n 20 --no-pager | sed 's/^/    /'
fi

# ============================================================================
# SUCCESS MESSAGE
# ============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo -e "║${GREEN}                  ✓ Setup Complete!${NC}                              ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${GREEN}Service Information:${NC}"
echo "  • Service Name: ${SERVICE_NAME}"
echo "  • Service File: ${SERVICE_FILE}"
echo "  • Auto-start: Enabled"
echo "  • Status: $(systemctl is-active ${SERVICE_NAME}.service)"
echo ""

echo -e "${GREEN}Useful Commands:${NC}"
echo "  • Check status:   ${BLUE}sudo systemctl status smartfarm${NC}"
echo "  • View logs:      ${BLUE}sudo journalctl -u smartfarm -f${NC}"
echo "  • Restart:        ${BLUE}sudo systemctl restart smartfarm${NC}"
echo "  • Stop:           ${BLUE}sudo systemctl stop smartfarm${NC}"
echo "  • Start:          ${BLUE}sudo systemctl start smartfarm${NC}"
echo ""

echo -e "${GREEN}Service Status:${NC}"
systemctl status "${SERVICE_NAME}.service" --no-pager | sed 's/^/  /'
echo ""

echo -e "${YELLOW}Note:${NC} If the service doesn't stay running, check logs with:"
echo "  ${BLUE}sudo journalctl -u smartfarm -n 50 --no-pager${NC}"
echo ""
