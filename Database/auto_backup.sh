#!/bin/bash

# Database Auto-Backup Script (Run every hour)
# Usage: chmod +x auto_backup.sh, then add to crontab: 0 * * * * /path/to/auto_backup.sh

cd /home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain

python3 << 'PYEOF'
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")
DB_PATH = "./Database/smartfarm_myweb.db"
BACKUP_FILE = "./Database/DATABASE_BACKUP.txt"

try:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    with open(BACKUP_FILE, 'a', encoding='utf-8') as f:
        timestamp = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"\n{'='*100}\n")
        f.write(f"📊 DATABASE SNAPSHOT - {timestamp}\n")
        f.write(f"{'='*100}\n\n")
        
        # Sensor data
        f.write("📡 LATEST SENSOR READINGS (ล่าสุด 10):\n")
        f.write("-"*100 + "\n")
        c.execute("""
            SELECT timestamp, air_temp, air_hum, soil_1_hum, soil_2_hum, env_lux, env_co2 
            FROM sensors ORDER BY id DESC LIMIT 10
        """)
        for row in c.fetchall():
            f.write(f"  {row[0]} | T:{row[1]:.1f}°C H:{row[2]:.1f}% S1:{row[3]:.1f}% S2:{row[4]:.1f}% L:{row[5]:.0f}lux C:{row[6]:.0f}ppm\n")
        
        # Relay history
        f.write("\n🔌 RECENT RELAY CHANGES (ล่าสุด 10):\n")
        f.write("-"*100 + "\n")
        relay_names = ['Pump', 'Fan', 'Lamp', 'Mist', 'Plot Pump 2', 'EvapPump', 'V1-P1', 'V2-P1', 'V3-P1', 'V1-P2', 'V2-P2', 'V3-P2']
        c.execute("SELECT timestamp, relay_index, state, mode FROM relay_history ORDER BY id DESC LIMIT 10")
        for row in c.fetchall():
            relay_name = relay_names[row[1]] if row[1] < len(relay_names) else f"R{row[1]}"
            state_str = "ON" if row[2] else "OFF"
            f.write(f"  {row[0]} | {relay_name:15} → {state_str} ({row[3]})\n")
        
        # Stats
        f.write("\n📈 STATISTICS:\n")
        f.write("-"*100 + "\n")
        c.execute("SELECT COUNT(*) FROM sensors")
        f.write(f"  Total Sensors: {c.fetchone()[0]}\n")
        c.execute("SELECT COUNT(*) FROM relay_history")
        f.write(f"  Total Relays: {c.fetchone()[0]}\n\n")
    
    conn.close()
    print(f"✅ Backup appended: {timestamp}")
    
except Exception as e:
    print(f"❌ Backup Error: {e}")
    import traceback
    traceback.print_exc()

PYEOF
