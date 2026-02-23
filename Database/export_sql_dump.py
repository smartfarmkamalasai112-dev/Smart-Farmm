#!/usr/bin/env python3
"""
SQLite Database Export - SQL Dump Format
Exports all data to .sql file (SQLite default format)
"""

import sqlite3
import os
from datetime import datetime
from zoneinfo import ZoneInfo

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")
DB_PATH = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/smartfarm_myweb.db"
DUMP_DIR = "/home/admin/PlatformIOProjects/SmartFarmMQTT-main/SmartFarmmain/Database/backups"
DUMP_FILE = os.path.join(DUMP_DIR, "smartfarm_dump.sql")

def ensure_backup_dir():
    """Create backup directory if not exists"""
    os.makedirs(DUMP_DIR, exist_ok=True)

def export_sql_dump():
    """Export database as SQL dump file"""
    try:
        conn = sqlite3.connect(DB_PATH)
        
        # Get SQL dump
        with open(DUMP_FILE, 'w', encoding='utf-8') as f:
            # Write header
            timestamp = datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"-- SQLite Database Dump\n")
            f.write(f"-- Generated: {timestamp}\n")
            f.write(f"-- Database: smartfarm_myweb.db\n")
            f.write(f"--\n\n")
            
            # Export all SQL (default SQLite dump format)
            for line in conn.iterdump():
                f.write(line + '\n')
        
        file_size = os.path.getsize(DUMP_FILE) / 1024  # KB
        print(f"✅ SQL Dump exported successfully")
        print(f"📁 File: {DUMP_FILE}")
        print(f"📊 Size: {file_size:.1f} KB")
        print(f"⏰ Time: {timestamp}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    ensure_backup_dir()
    export_sql_dump()
