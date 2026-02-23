#!/bin/bash

# Flask Auto-Restart Script for Smart Farm Dashboard
# This script continuously monitors Flask and automatically restarts it if it crashes
# Usage: ./restart-flask.sh

LOG_FILE="/tmp/flask-restart.log"
FLASK_PID=""
RESTART_DELAY=5
MAX_CONSECUTIVE_FAILURES=10

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure log file exists (but clear it on script start)
> "$LOG_FILE"

# Function to log messages
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >> "$LOG_FILE"
    
    # Also print to console with colors
    case $level in
        "INFO")
            echo -e "${BLUE}[${timestamp}] [INFO]${NC} ${message}"
            ;;
        "ERROR")
            echo -e "${RED}[${timestamp}] [ERROR]${NC} ${message}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[${timestamp}] [SUCCESS]${NC} ${message}"
            ;;
        "WARNING")
            echo -e "${YELLOW}[${timestamp}] [WARNING]${NC} ${message}"
            ;;
    esac
}

# Function to start Flask
start_flask() {
    log_message "INFO" "Starting Flask server..."
    
    # Change to the script directory
    cd "$(dirname "$0")" || exit
    
    # Activate virtual environment if it exists
    if [ -f "venv/bin/activate" ]; then
        log_message "INFO" "Activating virtual environment..."
        source venv/bin/activate
    fi
    
# Function to start Flask
start_flask() {
    log_message "INFO" "Starting Flask server..."
    
    # Change to the script directory
    cd "$(dirname "$0")" || exit
    
    # Activate virtual environment if it exists
    if [ -f "venv/bin/activate" ]; then
        log_message "INFO" "Activating virtual environment..."
        source venv/bin/activate
    fi
    
    # Fix for Eventlet + Python 3.13 compatibility issue
    # Eventlet expects ssl.wrap_socket which was removed in Python 3.13
    # We use a compatibility launcher that applies a monkey-patch
    export PYTHONPATH="/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/MyWeb:$PYTHONPATH"
    
    # Start Flask in the background, capturing output to temp file first
    TEMP_LOG="/tmp/flask-startup-$$.log"
    > "$TEMP_LOG"  # Clear temp log
    python app.py >> "$TEMP_LOG" 2>&1 &
    FLASK_PID=$!
    
    log_message "INFO" "Started Flask with PID: $FLASK_PID, waiting for initialization..."
    
    # Wait for Flask to initialize - it needs 3-5 seconds to fully start
    # Check PID is alive and gives it ample time before declaring success
    local startup_attempts=0
    local max_attempts=30  # 30 * 1 second = 30 seconds total wait
    local early_success=false
    
    while [ $startup_attempts -lt $max_attempts ]; do
        sleep 1
        ((startup_attempts++))
        
        # Check if process is still alive
        if ! kill -0 "$FLASK_PID" 2>/dev/null; then
            log_message "ERROR" "Flask process exited after $startup_attempts seconds"
            break
        fi
        
        # After 4 seconds of alive process, consider it a success
        # (Flask startup logs show it takes ~4-5 seconds to fully initialize)
        if [ $startup_attempts -ge 4 ]; then
            log_message "SUCCESS" "Flask running with PID: $FLASK_PID"
            early_success=true
            break
        fi
    done
    
    # Final validation: is process still alive?
    if kill -0 "$FLASK_PID" 2>/dev/null; then
        if [ "$early_success" = true ]; then
            # Append startup output to main log
            cat "$TEMP_LOG" >> "$LOG_FILE" 2>/dev/null
            rm -f "$TEMP_LOG"
            return 0
        else
            log_message "WARNING" "Flask process alive but took longer than expected ($startup_attempts seconds)"
            cat "$TEMP_LOG" >> "$LOG_FILE" 2>/dev/null
            rm -f "$TEMP_LOG"
            return 0
        fi
    else
        # Flask exited, capture the error
        log_message "ERROR" "Flask process died. Error output:"
        cat "$TEMP_LOG" >> "$LOG_FILE" 2>/dev/null
        rm -f "$TEMP_LOG"
        return 1
    fi
}
}

# Function to stop Flask
stop_flask() {
    if [ -n "$FLASK_PID" ] && kill -0 "$FLASK_PID" 2>/dev/null; then
        log_message "INFO" "Stopping Flask (PID: $FLASK_PID)..."
        kill -TERM "$FLASK_PID" 2>/dev/null
        sleep 2
        
        # Force kill if still running
        if kill -0 "$FLASK_PID" 2>/dev/null; then
            log_message "WARNING" "Force killing Flask..."
            kill -9 "$FLASK_PID" 2>/dev/null
        fi
        
        log_message "SUCCESS" "Flask stopped"
    fi
}

# Function to check if Flask is running
is_flask_running() {
    if [ -n "$FLASK_PID" ] && kill -0 "$FLASK_PID" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to monitor Flask
monitor_flask() {
    local consecutive_failures=0
    local startup_check=true  # First check should happen immediately
    
    while true; do
        if is_flask_running; then
            # Flask is running, reset failure counter
            consecutive_failures=0
            startup_check=false
            sleep 5
        else
            # Flask crashed or stopped
            ((consecutive_failures++))
            log_message "WARNING" "Flask is not running (consecutive failures: $consecutive_failures)"
            
            if [ $consecutive_failures -ge $MAX_CONSECUTIVE_FAILURES ]; then
                log_message "ERROR" "Flask has failed $MAX_CONSECUTIVE_FAILURES consecutive times. Exiting..."
                exit 1
            fi
            
            # If this is the first check after startup, show Flask output
            if [ "$startup_check" = true ]; then
                log_message "ERROR" "Flask startup failed. Showing error details:"
                tail -50 "$LOG_FILE" >> /dev/stderr 2>&1
            fi
            
            log_message "INFO" "Restarting Flask in $RESTART_DELAY seconds..."
            sleep $RESTART_DELAY
            
            start_flask
            if [ $? -eq 0 ]; then
                consecutive_failures=0
            fi
        fi
    done
}

# Trap signals for graceful shutdown
cleanup() {
    log_message "INFO" "Received shutdown signal. Cleaning up..."
    stop_flask
    log_message "INFO" "Flask auto-restart script stopped"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main execution
log_message "INFO" "Flask Auto-Restart Script Started"
log_message "INFO" "Log file: $LOG_FILE"
log_message "INFO" "Restart delay: ${RESTART_DELAY}s"
log_message "INFO" "Max consecutive failures: $MAX_CONSECUTIVE_FAILURES"

# Start Flask for the first time
start_flask
if [ $? -ne 0 ]; then
    log_message "ERROR" "Failed to start Flask initially. Exiting..."
    exit 1
fi

# Monitor Flask continuously
monitor_flask
