#!/bin/bash

# Smart Farm Backend Setup Script
# Run this on Raspberry Pi or any Linux system running the MQTT broker

set -e

echo "🚀 Smart Farm Backend Setup"
echo "============================="

# Check Python version
echo "📦 Checking Python installation..."
python3 --version || exit 1

# Create virtual environment (optional but recommended)
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
fi

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ Installation Complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit configuration in app.py (lines 18-24):"
echo "   - Set MQTT_BROKER IP"
echo "   - Set SERVER_IP"
echo ""
echo "2. Start the backend:"
echo "   python app.py"
echo ""
echo "3. For production, use systemd service or PM2"
echo ""
