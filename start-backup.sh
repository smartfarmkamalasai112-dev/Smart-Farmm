#!/bin/bash
# SmartFarm Continuous Backup Startup Script

cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain

# Kill any existing backup processes
pkill -f "python3.*continuous_backup.py" 2>/dev/null

# Start continuous backup
echo "🔄 Starting continuous database backup..."
python3 Database/continuous_backup.py >> Database/continuous_backup.log 2>&1 &
BACKUP_PID=$!

echo "✅ Continuous backup started (PID: $BACKUP_PID)"
echo $BACKUP_PID > /tmp/smartfarm_backup.pid

# Optional: Keep process alive
disown $BACKUP_PID
