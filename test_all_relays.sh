#!/bin/bash

# ============================================================================
# 🧪 Smart Farm MQTT Format Fix - Testing Script
# ============================================================================
# This script tests all 12 relays with the new MQTT format
# Run after: pkill -f "python app.py" && sleep 2 && cd MyWeb && python app.py

set -e

FLASK_URL="http://localhost:5000"

echo "=================================================="
echo "🧪 Testing ALL 12 Relays with New MQTT Format"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Relay names mapping
declare -A RELAY_NAMES=(
    [0]="Pump 🌊"
    [1]="Fan 🌬️"
    [2]="Lamp 💡"
    [3]="Mist 💨"
    [4]="Plot Pump 2 🌊"
    [5]="Evap Pump 🔄"
    [6]="Valve 1 🚰"
    [7]="Valve 2 🚰"
    [8]="Valve 3 🚰"
    [9]="Valve 4 🚰"
    [10]="Valve 5 🚰"
    [11]="Valve 6 🚰"
)

# Test function
test_relay() {
    local relay_index=$1
    local state=$2
    local state_word="ON"
    
    if [ "$state" = "false" ]; then
        state_word="OFF"
    fi
    
    echo -e "${BLUE}Testing Relay $relay_index (${RELAY_NAMES[$relay_index]}) → $state_word${NC}"
    
    response=$(curl -s -X POST "$FLASK_URL/api/control" \
        -H "Content-Type: application/json" \
        -d "{\"index\": $relay_index, \"state\": $state}")
    
    if echo "$response" | grep -q "error\|Error"; then
        echo -e "  ${YELLOW}⚠️  Response: $response${NC}"
    else
        echo -e "  ${GREEN}✅ Sent control command${NC}"
    fi
    
    sleep 1
}

# Test each relay - ON then OFF
for relay_index in {0..11}; do
    echo ""
    test_relay "$relay_index" "true"
    test_relay "$relay_index" "false"
done

echo ""
echo "=================================================="
echo -e "${GREEN}✅ All 12 relays tested!${NC}"
echo "=================================================="
echo ""
echo "📋 Next steps:"
echo "  1. Check Flask logs for MQTT publish messages:"
echo "     tail -f /tmp/flask.log | grep 'MQTT Published'"
echo ""
echo "  2. Check ESP32 serial output for:"
echo "     [RELAY CMD] Relay X -> ON/OFF"
echo ""
echo "  3. Monitor MQTT traffic:"
echo "     mosquitto_sub -t 'smartfarm/control' -v"
echo ""
echo "  4. Verify physical relay states changed"
echo ""
