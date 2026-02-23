#!/usr/bin/env python3
"""
Scheduled SQL Dump Exporter - Auto backup
Exports database to SQL dump file every interval (default: hourly)
"""

import sqlite3
import os
import time
import shutil
from datetime import datetime
from zoneinfo import ZoneInfo

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")
DB_PATH = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/smartfarm_myweb.db"
BACKUP_DIR = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/backups"
LATEST_DUMP = os.path.join(BACKUP_DIR, "smartfarm_dump.sql")
BACKUP_INTERVAL = 3600  # 1 hour (3600 seconds) - change this for different intervals
MAX_BACKUPS = 24  # Keep last 24 backups (1 day if hourly)

def ensure_backup_dir():
    """Create backup directory if not exists"""
    os.makedirs(BACKUP_DIR, exist_ok=True)

def export_sql_dump(filename):
    """Export database as SQL dump file"""
    try:
        conn = sqlite3.connect(DB_PATH)
        
        with open(filename, 'w', encoding='utf-8') as f:
            timestamp = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"-- SQLite Database Dump\n")
            f.write(f"-- Generated: {timestamp}\n")
            f.write(f"-- Database: smartfarm_myweb.db\n")
            f.write(f"--\n\n")
            
            # Export all SQL
            for line in conn.iterdump():
                f.write(line + '\n')
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error exporting: {e}")
        return False

def rotate_backups():
    """Keep only last MAX_BACKUPS timestamped files"""
    try:
        # Get all timestamped backup files
        files = []
        for f in os.listdir(BACKUP_DIR):
            if f.startswith('smartfarm_dump_') and f.endswith('.sql'):
                filepath = os.path.join(BACKUP_DIR, f)
                files.append((filepath, os.path.getmtime(filepath)))
        
        # Sort by modification time (newest first)
        files.sort(key=lambda x: x[1], reverse=True)
        
        # Delete old backups
        for filepath, _ in files[MAX_BACKUPS:]:
            try:
                os.remove(filepath)
                print(f"  🗑️  Removed old backup: {os.path.basename(filepath)}")
            except:
                pass
                
    except Exception as e:
        print(f"⚠️  Error rotating backups: {e}")

def scheduled_backup():
    """Run scheduled backups"""
    ensure_backup_dir()
    print(f"🔄 Starting scheduled SQL dump backup (every {BACKUP_INTERVAL//60} minutes)")
    
    while True:
        try:
            timestamp = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
            
            # Export to latest file
            if export_sql_dump(LATEST_DUMP):
                file_size = os.path.getsize(LATEST_DUMP) / 1024  # KB
                print(f"✅ [{timestamp}] Backed up {file_size:.1f} KB")
                
                # Also save timestamped copy
                ts_backup = os.path.join(BACKUP_DIR, f"smartfarm_dump_{datetime.now(BANGKOK_TZ).strftime('%Y%m%d_%H%M%S')}.sql")
                shutil.copy(LATEST_DUMP, ts_backup)
                
                # Rotate old backups
                rotate_backups()
            else:
                print(f"❌ [{timestamp}] Backup failed")
            
        except Exception as e:
            print(f"❌ Error: {e}")
        
        time.sleep(BACKUP_INTERVAL)

if __name__ == "__main__":
    try:
        scheduled_backup()
    except KeyboardInterrupt:
        print("\n🛑 Backup stopped")
