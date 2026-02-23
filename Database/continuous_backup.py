#!/usr/bin/env python3
"""
Continuous Database Backup Logger
Logs sensor and relay data every 5 seconds to DATABASE_BACKUP.txt
"""

import sqlite3
import time
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")
DB_PATH = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/smartfarm_myweb.db"
BACKUP_FILE = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/DATABASE_BACKUP.txt"
BACKUP_INTERVAL = 5  # seconds

relay_names = ['Pump', 'Fan', 'Lamp', 'Mist', 'Plot Pump 2', 'EvapPump', 'V1-P1', 'V2-P1', 'V3-P1', 'V1-P2', 'V2-P2', 'V3-P2']

# Track previous relay modes to detect AUTO → non-AUTO transitions
previous_modes = {i: 'MANUAL' for i in range(12)}

def log_exit_auto_event(relay_idx, old_mode, new_mode):
    """Log when relay exits AUTO mode - DISABLED (just track state changes)"""
    # This function is kept for backward compatibility but doesn't log
    # Mode changes are already shown in the regular relay state line: OFF/MANUAL
    pass

def continuous_backup():
    """Run continuous backup loop - Compact format"""
    print(f"🔄 Starting continuous backup (every {BACKUP_INTERVAL}s) - Compact mode...")
    
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            
            timestamp = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
            
            # Get latest sensor data
            c.execute("""
                SELECT air_temp, air_hum, soil_1_hum, soil_2_hum, env_lux, env_co2,
                       soil_1_ph, soil_1_n, soil_1_p, soil_1_k
                FROM sensors ORDER BY id DESC LIMIT 1
            """)
            sensor_row = c.fetchone()
            
            # ⭐ NEW: Get latest Node 3 soil sensor data
            c.execute("""
                SELECT soil_1, soil_2, soil_3, soil_4
                FROM soil_sensors_node3 ORDER BY id DESC LIMIT 1
            """)
            node3_row = c.fetchone()
            if not node3_row:
                 node3_row = (0, 0, 0, 0)
            
            # Get relay history
            c.execute("SELECT COUNT(*) as cnt FROM relay_history")
            relay_count = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) as cnt FROM sensors")
            sensor_count = c.fetchone()[0]
            
            # Get latest relay states and modes for all 12 relays
            relay_data = {}
            for relay_idx in range(12):
                # Get LATEST record for THIS specific relay
                c.execute("""
                    SELECT state, mode 
                    FROM relay_history 
                    WHERE relay_index = ? 
                    ORDER BY id DESC LIMIT 1
                """, (relay_idx,))
                
                row = c.fetchone()
                if row:
                    relay_data[relay_idx] = {
                        'state': 'ON' if row[0] else 'OFF',
                        'mode': row[1]
                    }
                else:
                    # Default for relays with no history
                    relay_data[relay_idx] = {'state': 'OFF', 'mode': 'MANUAL'}
                
                # Check if relay exited AUTO mode
                current_mode = relay_data[relay_idx]['mode']
                previous_mode = previous_modes[relay_idx]
                if current_mode != previous_mode:
                    log_exit_auto_event(relay_idx, previous_mode, current_mode)
                    previous_modes[relay_idx] = current_mode
            
            with open(BACKUP_FILE, 'a', encoding='utf-8') as f:
                if sensor_row:
                    try:
                        # Extract basic sensors
                        s1_val = sensor_row[2] if sensor_row[2] is not None else 0
                        s2_val = sensor_row[3] if sensor_row[3] is not None else 0
                        s1_ph = sensor_row[6] if sensor_row[6] is not None else 0
                        s1_n = sensor_row[7] if sensor_row[7] is not None else 0
                        s1_p = sensor_row[8] if sensor_row[8] is not None else 0
                        s1_k = sensor_row[9] if sensor_row[9] is not None else 0
                        
                        # Extract Node 3 sensors
                        n3_s1 = node3_row[0] if node3_row[0] is not None else 0
                        n3_s2 = node3_row[1] if node3_row[1] is not None else 0
                        n3_s3 = node3_row[2] if node3_row[2] is not None else 0
                        n3_s4 = node3_row[3] if node3_row[3] is not None else 0
                        
                        # Line 1: Timestamp + Sensor data (compact with Node 3)
                        sensor_line = (
                            f"{timestamp} | "
                            f"T:{sensor_row[0]:.1f}C H:{sensor_row[1]:.0f}% "
                            f"Soil1(H:{s1_val:.0f}% pH:{s1_ph:.1f} N:{s1_n:.0f} P:{s1_p:.0f} K:{s1_k:.0f}) Soil2:{s2_val:.0f}% "
                            f"L:{sensor_row[4]:.0f} C:{sensor_row[5]:.0f} | "
                            f"Node3[S1 (Hum:{n3_s1:.0f}% pH:0) S2:{n3_s2:.0f}% S3:{n3_s3:.0f}% S4:{n3_s4:.0f}%]\n"
                        )
                        f.write(sensor_line)
                    except Exception as err:
                        print(f"Error formatting sensor line: {err}")
                    
                    # Line 2: ALL 12 relays with state and mode
                    relay_line = f"               | "
                    relay_summary = []
                    for idx in range(len(relay_names)):
                        data = relay_data.get(idx, {'state': 'OFF', 'mode': 'MANUAL'})
                        state = data['state']
                        mode = data['mode']
                        relay_summary.append(f"{relay_names[idx]}:{state}/{mode}")
                    relay_line += " | ".join(relay_summary)
                    relay_line += f" | Total: S={sensor_count} R={relay_count}\n"
                    f.write(relay_line)
            
            conn.close()
            print(f"✅ {timestamp}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
        
        time.sleep(BACKUP_INTERVAL)

if __name__ == "__main__":
    try:
        continuous_backup()
    except KeyboardInterrupt:
        print("\n🛑 Backup stopped")
