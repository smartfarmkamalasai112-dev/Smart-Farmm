#!/bin/bash

# Smart Farm Dashboard - Start All Services
# This script starts both backend and frontend servers

set -e

PROJECT_ROOT="/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain"

echo "=========================================="
echo "  Smart Farm Dashboard - Startup Script"
echo "=========================================="
echo

# Kill any existing processes
echo "🛑 Stopping any existing services..."
killall -f "python3 app.py" 2>/dev/null || true
killall -f "vite" 2>/dev/null || true
killall -f "npm run dev" 2>/dev/null || true
sleep 2

# Start Backend
echo
echo "🚀 Starting Backend Server..."
cd "$PROJECT_ROOT/MyWeb"
python3 app.py > /tmp/smartfarm_backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo "   Log: /tmp/smartfarm_backend.log"

# Wait for backend to start
sleep 3

# Check if backend is responsive
echo "🔍 Checking backend status..."
if curl -s http://localhost:5000/api/status > /dev/null 2>&1; then
    echo "   ✅ Backend is running and responding"
else
    echo "   ⚠️  Backend not responding yet, retrying..."
    sleep 3
fi

# Start Frontend
echo
echo "🚀 Starting Frontend Server..."
cd "$PROJECT_ROOT/smart-farm-dashboard"
npm run dev > /tmp/smartfarm_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo "   Log: /tmp/smartfarm_frontend.log"

# Wait for frontend to start
sleep 5

# Check if frontend is responsive
echo "🔍 Checking frontend status..."
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "   ✅ Frontend is running and responding"
else
    echo "   ⚠️  Frontend not responding yet, still starting..."
fi

# Display running status
echo
echo "=========================================="
echo "  ✅ Services Started Successfully!"
echo "=========================================="
echo
echo "📊 Dashboard Access:"
echo "   Local Machine:     http://localhost:5173"
echo "   Same Machine:      http://localhost:5173"
echo "   Different Machine: http://localhost:5173?backend=http://IP:5000"
echo
echo "📡 Backend API:"
echo "   Status: http://localhost:5000/api/status"
echo "   Modes:  http://localhost:5000/api/relay-modes"
echo "   Config: http://localhost:5000/api/relay-configs"
echo
echo "📋 Logs:"
echo "   Backend:  tail -f /tmp/smartfarm_backend.log"
echo "   Frontend: tail -f /tmp/smartfarm_frontend.log"
echo
echo "🛑 To Stop Services:"
echo "   killall python3"
echo "   killall npm"
echo
echo "=========================================="
echo

# Keep script running
echo "Press Ctrl+C to view logs and stop services"
echo

# Function to handle Ctrl+C
cleanup() {
    echo
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Monitor both processes
while true; do
    sleep 1
    
    # Check if processes are still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "⚠️  Backend crashed! Check /tmp/smartfarm_backend.log"
        break
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "⚠️  Frontend crashed! Check /tmp/smartfarm_frontend.log"
        break
    fi
done

wait
