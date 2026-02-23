#!/bin/bash

# Smart Farm Frontend Setup Script
# Run this on the machine hosting the React dashboard

set -e

echo "🎨 Smart Farm Frontend Setup"
echo "============================="

# Check Node.js
echo "📦 Checking Node.js installation..."
node --version || exit 1
npm --version || exit 1

# Install dependencies
echo "📥 Installing dependencies..."
npm install

echo ""
echo "✅ Installation Complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit configuration in src/App.jsx (line 15):"
echo "   const SOCKET_URL = \"http://YOUR_SERVER_IP:5000\";"
echo ""
echo "2. Start development server:"
echo "   npm run dev"
echo ""
echo "3. For production build:"
echo "   npm run build"
echo ""
