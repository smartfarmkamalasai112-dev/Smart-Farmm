import sys
import ssl

# === CRITICAL: Python 3.13 Compatibility Patches ===

# Fix ssl.wrap_socket for Python 3.13
if not hasattr(ssl, 'wrap_socket'):
    def wrap_socket_compat(sock, keyfile=None, certfile=None, server_side=False,
                           cert_reqs=ssl.CERT_NONE, ssl_version=ssl.PROTOCOL_TLS,
                           ca_certs=None, do_handshake_on_connect=True,
                           suppress_ragged_eofs=True, ciphers=None, **kwargs):
        """Compatibility wrapper for ssl.wrap_socket removed in Python 3.13"""
        try:
            context = ssl.create_default_context() if not server_side else ssl.SSLContext(ssl_version)
            if certfile:
                context.load_cert_chain(certfile, keyfile)
            if ca_certs:
                context.load_verify_locations(ca_certs)
            context.check_hostname = False
            context.verify_mode = cert_reqs
            return context.wrap_socket(sock, server_side=server_side, do_handshake_on_connect=do_handshake_on_connect)
        except Exception:
            return sock
    ssl.wrap_socket = wrap_socket_compat

# For Python 3.13 + Eventlet 0.33.3, use threading backend instead of eventlet
# Eventlet is not compatible with Python 3.13's threading changes
import os
os.environ['SOCKETIO_ASYNC_MODE'] = 'threading'

import eventlet
try:
    eventlet.monkey_patch()
except Exception:
    # If monkey_patch fails, continue anyway - we'll use threading mode
    pass

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import paho.mqtt.client as mqtt
import json
import sqlite3
import threading
import time
import copy
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import logging
import traceback
import random

# --- IMPORT SENSOR WATCHDOG ---
from sensor_watchdog import SensorWatchdog

# --- LOGGING CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
# Use absolute path based on script location (handles different working directories)
import os
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(os.path.dirname(SCRIPT_DIR), "Database", "smartfarm_myweb.db")
MQTT_BROKER = "localhost"  # Change to Pi IP if remote
MQTT_PORT = 1883
MQTT_TOPIC_SENSORS = "smartfarm/sensors"
MQTT_TOPIC_CONTROL = "smartfarm/control"
SERVER_IP = "100.119.101.9"
SERVER_PORT = 5000

# --- TIMEZONE CONFIGURATION ---
BANGKOK_TZ = ZoneInfo("Asia/Bangkok")

def get_current_timestamp():
    """Get current timestamp in Bangkok timezone"""
    return datetime.now(BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")

# --- SETUP FLASK & SOCKETIO ---
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False

# Enable CORS for API and Socket.IO
CORS(app, 
     resources={r"/api/*": {"origins": "*"}},
     supports_credentials=True)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",  # Allow all origins (Nginx/Tailscale compatibility)
    async_mode='threading',  # Changed from 'eventlet' for Python 3.13 compatibility
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True,
    transport=['polling', 'websocket'],  # Polling first, then websocket
    path='/socket.io',
    # Proxy support - trust X-Forwarded headers from Nginx
    engineio_logger_level='WARNING',
    # Don't validate origin when behind reverse proxy
    handle_disconnects=True
)

# Add CORS headers middleware
@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# --- GLOBAL STATE (RAM) ---
# Relay modes: MANUAL or AUTO for each relay (0-11) - DEFAULT MANUAL
relay_modes = {
    0: 'MANUAL',   # Pump - DEFAULT MANUAL
    1: 'MANUAL',   # Fan - DEFAULT MANUAL
    2: 'MANUAL',   # Lamp - DEFAULT MANUAL
    3: 'MANUAL',   # Mist - DEFAULT MANUAL
    4: 'MANUAL',   # Plot Pump 2 - DEFAULT MANUAL
    5: 'MANUAL',   # EvapPump - DEFAULT MANUAL
    6: 'MANUAL',   # Valve1 P1 - DEFAULT MANUAL
    7: 'MANUAL',   # Valve2 P1 - DEFAULT MANUAL
    8: 'MANUAL',   # Valve3 P1 - DEFAULT MANUAL
    9: 'MANUAL',   # Valve1 P2 - DEFAULT MANUAL
    10: 'MANUAL',  # Valve2 P2 - DEFAULT MANUAL
    11: 'MANUAL'   # Valve3 P2 - DEFAULT MANUAL
}

# Relay configurations for AUTO mode
relay_configs = {
    0: {'target': 40.0, 'condition': '<', 'param': 'soil_hum'},  # Pump: ON if soil humidity < 40%
    1: {
        'target1': 30.0, 'condition1': '>', 'param1': 'temp',
        'target2': 80.0, 'condition2': '>', 'param2': 'hum',
        'logic': 'OR'
    },  # Fan: Dual sensor (Temp OR Humidity)
    2: {'target': 200.0, 'condition': '<', 'param': 'lux'},      # Lamp: ON if light < 200 lux
    3: {'target': 60.0, 'condition': '<', 'param': 'hum'}   # Mist: ON if air humidity < 60%
}
logger.info(f"📋 Initial relay_configs (defaults): {relay_configs}")

# ⭐⭐⭐ CLEAN: BARE BINARY DEFAULTS - NO HYSTERESIS ⭐⭐⭐
relay_configs = {
    0: {'target': 35.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 0 - Pump
    1: {
        'target1': 28.0, 'condition1': '>', 'param1': 'temp',
        'target2': 75.0, 'condition2': '>', 'param2': 'hum',
        'logic': 'OR'
    },  # Relay 1 - Fan: Dual sensor (temp OR humidity)
    2: {'target': 200.0, 'condition': '<', 'param': 'lux'},  # Relay 2 - Lamp
    3: {'target': 60.0, 'condition': '<', 'param': 'hum'},  # Relay 3 - Mist (air humidity)
    4: {'target': 35.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 4 - Plot Pump 2
    5: {'target': 35.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 5 - EvapPump
    6: {'target': 50.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 6 - Valve1 P1: Single sensor
    7: {'target': 50.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 7 - Valve2 P1 (soil humidity)
    8: {'target': 50.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 8 - Valve3 P1
    9: {'target': 50.0, 'condition': '<', 'param': 'soil_hum'},  # Relay 9 - Valve1 P2: Single sensor
    10: {'target': 150.0, 'condition': '<', 'param': 'lux'},  # Relay 10 - Valve2 P2
    11: {'target': 50.0, 'condition': '<', 'param': 'soil_hum'}  # Relay 11 - Valve3 P2 (FIXED: condition < not >)
}
logger.info(f"📋 Relay configs (BINARY - NO HYSTERESIS): {relay_configs}")

# Track previous relay states to avoid repeated commands
# ⭐ CRITICAL: Protected by state_lock for thread-safe access
relay_previous_state = {0: False, 1: False, 2: False, 3: False, 4: False, 5: False, 6: False, 7: False, 8: False, 9: False, 10: False, 11: False}

# Sensor smoothing DISABLED - using exact raw values from MQTT
sensor_history = {}
MAX_HISTORY_SIZE = 1  # No buffering

current_state = {
    "sensors": {
        "air": {"temp": 0.0, "hum": 0.0},
        "soil_1": {"hum": 0.0, "ph": 0.0, "n": 0.0, "p": 0.0, "k": 0.0},
        "soil_2": {"hum": 0.0},
        "env": {"lux": 0.0, "co2": 0.0}
    },
    "status": {
        "mode": "MANUAL",
        "relays": [False, False, False, False, False, False, False, False, False, False, False, False],
        "last_update": None,
        "esp32_status": "🔴 DISCONNECTED"  # ⭐ NEW: Track ESP32 connection status
    }
}

# ⭐ SENSOR WATCHDOG: Monitor ESP32 sensor data freshness
sensor_watchdog = SensorWatchdog(timeout_seconds=30)  # Mark as stale if no data for 30 seconds

state_lock = threading.Lock()

# BINARY MODE: All delays set to 0
relay_state_change_time = {i: 0 for i in range(12)}
RELAY_COOLDOWN_SECONDS = 0  # Binary: No cooldown - relay changes immediately when condition changes
RELAY_TURN_ON_DELAY_SECONDS = 0  # Binary: Turn ON immediately when condition is met
RELAY_TURN_OFF_DELAY_SECONDS = 0  # Binary: Turn OFF immediately when condition is not met

# ⭐ TARGETED ANTI-CHATTER HOLD TIMES (seconds)
# Valve relays (6-11) now use PULSE MODE instead of hold time — set to 0
RELAY_MIN_HOLD_SECONDS = {
    3: 25,   # Mist: avoid short pulses
}

def get_relay_min_hold_seconds(relay_index):
    """Return per-relay minimum hold time before allowing next toggle."""
    return int(RELAY_MIN_HOLD_SECONDS.get(relay_index, 0))

# ===== PULSE MODE FOR VALVE RELAYS (6-11) =====
# Valve relays run in 10s ON / 10s OFF cycles while sensor condition is active
# Immediately OFF when sensor crosses threshold
PULSE_RELAYS = {6, 7, 8, 9, 10, 11}
PULSE_ON_SECONDS  = 10   # เปิด 10 วินาที
PULSE_OFF_SECONDS = 10   # ปิด 10 วินาที

# phase: 'IDLE' | 'ON' | 'OFF'
pulse_state = {i: {'phase': 'IDLE', 'phase_start': 0.0} for i in PULSE_RELAYS}

def evaluate_pulse(relay_index, should_turn_on, current_relay_state):
    """
    State machine for pulse-mode valve relays.
    Returns the actual desired relay state after applying pulse timing.
    """
    global pulse_state
    ps = pulse_state[relay_index]
    now = time.time()

    if not should_turn_on:
        # Sensor condition no longer met → OFF immediately, reset cycle
        pulse_state[relay_index] = {'phase': 'IDLE', 'phase_start': 0.0}
        return False

    # Sensor condition still active → manage ON/OFF cycle
    phase   = ps['phase']
    elapsed = now - ps['phase_start']

    if phase == 'IDLE':
        # First trigger → start ON phase
        pulse_state[relay_index] = {'phase': 'ON', 'phase_start': now}
        return True

    elif phase == 'ON':
        if elapsed < PULSE_ON_SECONDS:
            return True                 # still in ON window
        else:
            # ON time expired → switch to OFF phase
            pulse_state[relay_index] = {'phase': 'OFF', 'phase_start': now}
            return False

    else:  # phase == 'OFF'
        if elapsed < PULSE_OFF_SECONDS:
            return False                # still in OFF window
        else:
            # OFF time expired → start next ON phase
            pulse_state[relay_index] = {'phase': 'ON', 'phase_start': now}
            return True

# SENSOR-SPECIFIC ABSOLUTE MARGINS (instead of percentage-based hysteresis)
# Prevents oscillation by using absolute values calibrated per sensor type
# ⭐ OPTIMIZED FOR NOISY SENSORS: Balanced margins to prevent oscillation without losing control
SENSOR_MARGINS = {
    'temp': 0.0,        # Temperature: pure binary (OFF immediately when crosses threshold)
    'hum': 0.0,         # Humidity: pure binary
    'lux': 0.0,         # Light: pure binary
    'soil_hum': 0.0,    # Soil Humidity: pure binary
    'soil_2_hum': 0.0,  # Soil 2 Humidity: pure binary
    'ph': 0.0,          # pH: pure binary
    'co2': 0.0,         # CO2: pure binary
    'n': 0.0,           # Nitrogen: pure binary
    'p': 0.0,           # Phosphorus: pure binary
    'k': 0.0            # Potassium: pure binary
}

def get_sensor_margin(param):
    """Get absolute margin for a sensor parameter.

    IMPORTANT:
    - "soil_hum" must use its dedicated margin (15.0), not the generic
      "hum" margin (5.0). Because "hum" is a substring of "soil_hum",
      we must special‑case soil humidity before doing generic substring
      matching, otherwise valves and soil‑based relays will oscillate.
    """
    param_lower = str(param).lower()

    # 1) Exact key match first (most specific)
    if param_lower in SENSOR_MARGINS:
        return SENSOR_MARGINS[param_lower]

    # 2) Special case: soil humidity should never fall back to generic "hum"
    if "soil_hum" in param_lower and "soil_hum" in SENSOR_MARGINS:
        return SENSOR_MARGINS["soil_hum"]

    # 3) Generic substring fallback for other sensor types
    for key, margin in SENSOR_MARGINS.items():
        if key in param_lower:
            return margin

    # 4) Safe default margin
    return 2.0

# ===== CRITICAL STATE RESET FUNCTION =====
def reset_all_relay_states():
    """
    ⭐⭐⭐ CRITICAL INITIALIZATION ⭐⭐⭐
    
    Forcefully reset ALL relay states to safe defaults.
    This must run BEFORE any AUTO mode evaluation to ensure:
    1. All 12 relays are in MANUAL mode
    2. All previous state caches are cleared
    3. All cooldown timers are reset
    4. Database is cleaned of corrupted entries
    """
    global relay_modes, relay_previous_state, relay_state_change_time, current_state
    
    logger.critical("🔧🔧🔧 PERFORMING CRITICAL STATE RESET 🔧🔧🔧")
    
    # STEP 1: Ensure all data structures have exactly 12 entries (indices 0-11)
    logger.info("📋 STEP 1: Validating array sizes...")
    
    # Initialize relay_modes: ALL relays default to MANUAL (safer default)
    relay_modes = {i: 'MANUAL' for i in range(12)}
    logger.info(f"✅ relay_modes: {len(relay_modes)} entries (0-11)")
    logger.info(f"   ⚪ All relays default to MANUAL (user can enable AUTO mode if needed)")
    
    # Initialize relay_previous_state with all 12 relays to None (unknown state)
    relay_previous_state = {i: None for i in range(12)}
    logger.info(f"✅ relay_previous_state: {len(relay_previous_state)} entries (0-11)")
    
    # Initialize relay_state_change_time with all 12 relays to 0 (no cooldown)
    relay_state_change_time = {i: 0 for i in range(12)}
    logger.info(f"✅ relay_state_change_time: {len(relay_state_change_time)} entries (0-11)")
    
    # Ensure current_state relays array has 12 entries
    with state_lock:
        if len(current_state["status"]["relays"]) != 12:
            logger.warning(f"⚠️ current_state relays had {len(current_state['status']['relays'])} entries, resetting to 12")
            current_state["status"]["relays"] = [False] * 12
        logger.info(f"✅ current_state relays: {len(current_state['status']['relays'])} entries (0-11)")
    
    # STEP 2: Ensure relay_configs has all 12 relays with valid configs
    logger.info("📋 STEP 2: Validating relay configs...")
    for relay_idx in range(12):
        if relay_idx not in relay_configs or not relay_configs[relay_idx]:
            logger.warning(f"⚠️ Relay {relay_idx} has no config, using default")
    logger.info(f"✅ relay_configs: {len(relay_configs)} entries (0-11)")
    
    # STEP 3: Clear corrupted database entries
    logger.info("📋 STEP 3: Cleaning database...")
    try:
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            
            # Clear all relay_history entries
            # c.execute("DELETE FROM relay_history")
            # deleted_count = c.rowcount
            # logger.info(f"   ✅ Deleted {deleted_count} corrupted relay_history entries")
            
            # Clear all relay_configs_db entries
            c.execute("DELETE FROM relay_configs_db")
            deleted_count = c.rowcount
            logger.info(f"   ✅ Deleted {deleted_count} corrupted relay_configs_db entries")
            
            conn.commit()
    except Exception as e:
        logger.error(f"❌ Database cleanup failed: {e}")
    
    # STEP 4: Initialize all relays to MANUAL (safer default)
    logger.info("📋 STEP 4: Initializing relay modes...")
    logger.info(f"   ✅ All 12 relays reset to MANUAL (in-memory only)")
    logger.info(f"   ℹ️  Database will be loaded next to restore user's AUTO/MANUAL preferences")
    logger.info(f"   ℹ️  DO NOT insert defaults into database - load_relay_modes() will override!")
    # relay_modes is already set to all MANUAL at the top of this function (line 240)
    # We do NOT write to database here because:
    # 1. load_relay_modes() runs AFTER this and loads user preferences from DB
    # 2. Writing here would overwrite user preferences
    # 3. Only API calls and user actions should modify the database
    
    # STEP 5: Save default configs to database
    logger.info("📋 STEP 5: Saving default configs to database...")
    try:
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            
            for relay_idx in range(12):
                if relay_idx in relay_configs:
                    config = relay_configs[relay_idx]
                    json_str = json.dumps(config)
                    c.execute(
                        "INSERT OR REPLACE INTO relay_configs_db (relay_index, config) VALUES (?, ?)",
                        (relay_idx, json_str)
                    )
                    logger.info(f"   ✅ Relay {relay_idx}: Config saved - {config}")
            
            conn.commit()
            logger.info(f"✅ All 12 relay configs saved to database")
    except Exception as e:
        logger.error(f"❌ Failed to save configs to database: {e}")
    
    logger.critical("✅✅✅ CRITICAL STATE RESET COMPLETE ✅✅✅")
    logger.critical(f"📊 Final State Summary:")
    logger.critical(f"   • relay_modes: {relay_modes}")
    logger.critical(f"   • relay_previous_state: {relay_previous_state}")
    logger.critical(f"   • relay_state_change_time: {relay_state_change_time}")
    logger.critical(f"   • current_state relays: {current_state['status']['relays']}")

# --- DATABASE FUNCTIONS ---
def init_db():
    """Initialize database schema with new data structure"""
    global relay_modes
    
    # ⭐ NOTE: relay_modes has already been set by reset_all_relay_states()
    # Don't override it here - just load from database if needed
    logger.info(f"📋 init_db() preserving relay_modes set by reset_all_relay_states(): {relay_modes}")
    
    with sqlite3.connect(DB_NAME) as conn:
        c = conn.cursor()
        
        # Main sensors table with new structure
        c.execute('''CREATE TABLE IF NOT EXISTS sensors 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                      air_temp REAL, air_hum REAL,
                      soil_1_hum REAL, soil_1_ph REAL, soil_1_n REAL, soil_1_p REAL, soil_1_k REAL,
                      soil_2_hum REAL,
                      env_lux REAL, env_co2 REAL)''')
        
        # ⭐ NEW: Soil sensors table (Node 3 - 4 moisture sensors)
        c.execute('''CREATE TABLE IF NOT EXISTS soil_sensors_node3
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                      soil_1 REAL, soil_2 REAL, soil_3 REAL, soil_4 REAL)''')
        # Migration: add ph/npk columns for Node3 S1 (7-in-1 sensor) if not already present
        for col in ['soil_1_ph', 'soil_1_n', 'soil_1_p', 'soil_1_k']:
            try:
                c.execute(f'ALTER TABLE soil_sensors_node3 ADD COLUMN {col} REAL DEFAULT 0')
            except Exception:
                pass  # Column already exists
        
        # System state persistence table
        c.execute('''CREATE TABLE IF NOT EXISTS system_state 
                     (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
        
        # Relay control history
        c.execute('''CREATE TABLE IF NOT EXISTS relay_history
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                      relay_index INTEGER,
                      state BOOLEAN,
                      mode TEXT)''')
        
        # ⭐ NEW: Relay configurations persistence table
        c.execute('''CREATE TABLE IF NOT EXISTS relay_configs_db
                     (relay_index INTEGER PRIMARY KEY,
                      config TEXT,
                      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')

        # Relay modes config table (AUTO/MANUAL per relay)
        c.execute('''CREATE TABLE IF NOT EXISTS relay_modes_config
                     (relay_index INTEGER PRIMARY KEY,
                      mode TEXT DEFAULT 'MANUAL',
                      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')

        # Indexes for fast range queries (timestamp-based filtering)
        c.execute('CREATE INDEX IF NOT EXISTS idx_sensors_timestamp ON sensors(timestamp)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_relay_history_relay_ts ON relay_history(relay_index, timestamp)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_node3_timestamp ON soil_sensors_node3(timestamp)')

        conn.commit()
        logger.info("✅ Database Initialized Successfully")

def load_relay_modes():
    """Load relay modes (AUTO/MANUAL) from database on startup.
    ⭐ CRITICAL: This restores user's mode preferences from previous sessions."""
    global relay_modes
    relay_names = ['Pump', 'Fan', 'Lamp', 'Mist', 'Plot Pump 2', 'EvapPump', 'V1-P1', 'V2-P1', 'V3-P1', 'V1-P2', 'V2-P2', 'V3-P2']
    
    logger.info("🔄 Loading relay modes from database...")
    try:
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            
            loaded_modes = {}
            # Get the latest mode for each relay
            for relay_idx in range(12):
                c.execute("""
                    SELECT mode FROM relay_history 
                    WHERE relay_index = ? 
                    ORDER BY id DESC LIMIT 1
                """, (relay_idx,))
                row = c.fetchone()
                if row and row[0] in ['AUTO', 'MANUAL']:
                    loaded_modes[relay_idx] = row[0]
                    logger.info(f"   ✅ Relay {relay_idx} ({relay_names[relay_idx]}): {row[0]}")
                else:
                    logger.info(f"   ⚠️  Relay {relay_idx} ({relay_names[relay_idx]}): No mode in DB, using MANUAL")
            
            # Update relay_modes with loaded values
            relay_modes.update(loaded_modes)
            logger.info(f"✅ Loaded relay modes: {relay_modes}")
    
    except Exception as e:
        logger.error(f"❌ Failed to load relay modes from DB: {e}")
        logger.info("⚠️  Using default relay modes (all MANUAL)")

def save_sensor_data(data):
    """Save sensor data to SQLite database"""
    try:
        air = data.get('air', {})
        soil_1 = data.get('soil_1', {})
        soil_2 = data.get('soil_2', {})
        env = data.get('env', {})

        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO sensors 
                         (timestamp, air_temp, air_hum, soil_1_hum, soil_1_ph, soil_1_n, soil_1_p, soil_1_k,
                          soil_2_hum, env_lux, env_co2) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (
                          get_current_timestamp(),
                          air.get('temp', 0.0),
                          air.get('hum', 0.0),
                          soil_1.get('hum', 0.0),
                          soil_1.get('ph', 0.0),
                          soil_1.get('n', 0.0),
                          soil_1.get('p', 0.0),
                          soil_1.get('k', 0.0),
                          soil_2.get('hum', 0.0),
                          env.get('lux', 0.0),
                          env.get('co2', 0.0)
                      ))
            conn.commit()
            logger.debug(f"💾 Data saved to database")
    except Exception as e:
        logger.error(f"❌ DB Save Error: {e}")

def save_soil_sensor_data(data):
    """Save soil sensor data from Node 3 to SQLite database"""
    try:
        def get_hum(val):
            if isinstance(val, dict):
                return float(val.get('hum', 0.0))
            return float(val) if val is not None else 0.0

        # Extract ph/n/p/k from soil_1 (7-in-1 sensor on Node 3)
        soil_1_data = data.get('soil_1', {})
        if isinstance(soil_1_data, dict):
            soil_1_ph = float(soil_1_data.get('ph', 0.0))
            soil_1_n  = float(soil_1_data.get('n',  0.0))
            soil_1_p  = float(soil_1_data.get('p',  0.0))
            soil_1_k  = float(soil_1_data.get('k',  0.0))
        else:
            soil_1_ph = soil_1_n = soil_1_p = soil_1_k = 0.0

        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO soil_sensors_node3 
                         (timestamp, soil_1, soil_2, soil_3, soil_4,
                          soil_1_ph, soil_1_n, soil_1_p, soil_1_k) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (
                          get_current_timestamp(),
                          get_hum(data.get('soil_1', 0.0)),
                          get_hum(data.get('soil_2', 0.0)),
                          get_hum(data.get('soil_3', 0.0)),
                          get_hum(data.get('soil_4', 0.0)),
                          soil_1_ph, soil_1_n, soil_1_p, soil_1_k
                      ))
            conn.commit()
            logger.debug(f"🌱 Soil sensor data saved to database: {data}")
    except Exception as e:
        logger.error(f"❌ Soil Sensor DB Save Error: {e}")

def load_last_state():
    """Load last known state from database to RAM - CRITICAL for persistence"""
    global current_state
    logger.info("🔄 Loading last known state from database...")
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM sensors ORDER BY id DESC LIMIT 1")
            row = c.fetchone()
            
            if row:
                with state_lock:
                    current_state["sensors"] = {
                        "air": {
                            "temp": float(row['air_temp'] or 0.0),
                            "hum": float(row['air_hum'] or 0.0)
                        },
                        "soil_1": {
                            "hum": float(row['soil_1_hum'] or 0.0),
                            "ph": float(row['soil_1_ph'] or 0.0),
                            "n": float(row['soil_1_n'] or 0.0),
                            "p": float(row['soil_1_p'] or 0.0),
                            "k": float(row['soil_1_k'] or 0.0)
                        },
                        "soil_2": {
                            "hum": float(row['soil_2_hum'] or 0.0)
                        },
                        "env": {
                            "lux": float(row['env_lux'] or 0.0),
                            "co2": float(row['env_co2'] or 0.0)
                        }
                    }
                logger.info("✅ State Restored from Database!")
                logger.info(f"Latest data: {current_state['sensors']}")
            else:
                logger.info("ℹ️ Database is empty, using default values.")
    except Exception as e:
        logger.error(f"❌ Load State Error: {e}")

def save_relay_config_to_db(relay_index, config):
    """Save relay config to database - CRITICAL for persistence"""
    try:
        logger.info(f"💾 SAVING to DB - Relay {relay_index}: {config}")
        # TRACE condition value
        if 'condition' in config:
            logger.info(f"   → Condition value: '{config['condition']}' (type={type(config['condition']).__name__})")
        
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            json_str = json.dumps(config)
            logger.info(f"   → JSON string: {json_str}")
            logger.info(f"   → Executing: INSERT OR REPLACE INTO relay_configs_db (relay_index, config) VALUES ({relay_index}, {json_str!r})")
            c.execute(
                "INSERT OR REPLACE INTO relay_configs_db (relay_index, config) VALUES (?, ?)",
                (relay_index, json_str)
            )
            conn.commit()
            logger.info(f"✅ Relay {relay_index} config SUCCESSFULLY saved to database")
            
            # Verify write by reading back
            c.execute("SELECT config FROM relay_configs_db WHERE relay_index = ?", (relay_index,))
            result = c.fetchone()
            if result:
                saved_config = json.loads(result[0])
                logger.info(f"✅ Verification READ BACK: {saved_config}")
                if 'condition' in saved_config:
                    logger.info(f"   → Read back condition: '{saved_config['condition']}' (type={type(saved_config['condition']).__name__})")
            else:
                logger.error(f"❌ Verification FAILED: Could not read back config from database")
    except Exception as e:
        logger.error(f"❌ Failed to save relay config to DB: {e}")

def load_relay_configs_from_db():
    """Load all relay configs from database on startup.
    If database is empty, save defaults and use those.
    
    ⭐ CRITICAL: Never load corrupted database values. Defaults are correct."""
    global relay_configs
    logger.info("🔄 Loading relay configs from database...")
    logger.info(f"   Current relay_configs BEFORE load: {relay_configs}")
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM relay_configs_db")
            rows = c.fetchall()
            
            logger.info(f"   Database query returned {len(rows) if rows else 0} rows")
            
            loaded_count = 0
            
            if rows:
                # ⭐ LOAD FROM DATABASE: Use configs saved from UI settings
                loaded_count = 0
                for row in rows:
                    try:
                        relay_index = row['relay_index']
                        config = json.loads(row['config'])
                        # Validate config has required fields (single or dual sensor)
                        is_dual = 'target1' in config and 'param1' in config
                        is_single = 'target' in config and 'param' in config
                        if is_dual or is_single:
                            relay_configs[relay_index] = config
                            loaded_count += 1
                            logger.info(f"   ✅ Loaded Relay {relay_index} from DB: {config}")
                        else:
                            logger.warning(f"   ⚠️ Relay {relay_index}: Invalid config in DB {config}, keeping default")
                    except Exception as row_err:
                        logger.warning(f"   ⚠️ Failed to load row: {row_err}")
                logger.info(f"✅ Loaded {loaded_count}/{len(rows)} relay configs from database")
            else:
                logger.info("ℹ️ No saved relay configs found. Saving defaults to database...")
                # ⭐ CRITICAL: Save defaults to database for persistence
                for relay_index in range(12):
                    config = relay_configs[relay_index]
                    json_str = json.dumps(config)
                    c.execute(
                        "INSERT OR REPLACE INTO relay_configs_db (relay_index, config) VALUES (?, ?)",
                        (relay_index, json_str)
                    )
                    logger.info(f"   💾 Saved default config for Relay {relay_index}: {config}")
                conn.commit()
                logger.info("✅ Default relay configs saved to database!")
            
            logger.info(f"   Current relay_configs AFTER load: {relay_configs}")
    except Exception as e:
        logger.error(f"❌ Failed to load relay configs from DB: {e}")
        logger.info("⚠️  Using default relay configs")

# --- MQTT FUNCTIONS ---
# Note: Using VERSION1 API - shows deprecation warning but auto-reconnects reliably
# VERSION2 would require callback signature changes (rc instead of flags+rc)
try:
    # Try VERSION1 first (newer paho-mqtt versions)
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id="smartfarm-backend")
except (TypeError, AttributeError):
    # Fall back if VERSION1 not available or old paho-mqtt version
    try:
        mqtt_client = mqtt.Client(client_id="smartfarm-backend")
    except TypeError:
        # Even older version without keyword argument
        mqtt_client = mqtt.Client("smartfarm-backend")

mqtt_connected = False

def on_mqtt_connect(client, userdata, flags, rc):
    global mqtt_connected
    if rc == 0:
        mqtt_connected = True
        logger.info("✅ MQTT Connected with result code 0")
        client.subscribe(MQTT_TOPIC_SENSORS, qos=1)
        client.subscribe("smartfarm/status", qos=1)
        client.subscribe("smartfarm/soil_sensors", qos=1)  # ⭐ Subscribe to Node 3 soil sensors
    else:
        mqtt_connected = False
        logger.error(f"❌ MQTT Connection failed with code {rc}")

def normalize_sensor_data(payload):
    """
    Convert MQTT data format to dashboard schema format
    ESP32 sends: {'air': {...}, 'soil_1': {...}, 'soil_2': {...}, 'env': {...}}
    Dashboard uses: {'air': {...}, 'soil_1': {...}, 'soil_2': {...}, 'env': {...}}
    """
    normalized = {
        'air': payload.get('air', {}),
        'soil_1': payload.get('soil_1', {}),  # Direct mapping from ESP32
        'soil_2': payload.get('soil_2', {}),  # Direct mapping from ESP32
        'env': payload.get('env', {})
    }
    
    return normalized

def build_status_payload():
    """Build status payload with sensor_fresh always included — use for all status_update emissions"""
    with state_lock:
        payload = {**current_state["status"], "relay_modes": relay_modes}
    payload["sensor_fresh"] = sensor_watchdog.is_data_fresh
    return payload

def evaluate_auto_mode(normalized_sensors):
    """
    ⭐ BINARY AUTO MODE WITH STRICT STATE CHECKING ⭐
    
    CRITICAL RULE:
    - ONLY publish MQTT if new_state != current_known_state
    - State source of truth: current_state["status"]["relays"][relay_index]
    - All state reads/writes protected by state_lock
    - NO duplicate MQTT commands ever sent
    """
    global relay_modes, relay_configs, relay_previous_state, current_state, relay_state_change_time
    
    try:
        # Extract raw sensor values safely (handle missing data)
        soil_1_hum = normalized_sensors.get('soil_1', {}).get('hum')
        soil_2_hum = normalized_sensors.get('soil_2', {}).get('hum')
        
        if soil_1_hum is not None:
            soil_hum = float(soil_1_hum)   # ใช้ Sensor 1 เท่านั้น (ไม่เฉลี่ยกับ Sensor 2)
        else:
            soil_hum = None
            
        air_temp = normalized_sensors.get('air', {}).get('temp')
        air_temp = float(air_temp) if air_temp is not None else None
        
        air_hum = normalized_sensors.get('air', {}).get('hum')
        air_hum = float(air_hum) if air_hum is not None else None
        
        lux = normalized_sensors.get('env', {}).get('lux')
        lux = float(lux) if lux is not None else None
        
        co2 = normalized_sensors.get('env', {}).get('co2')
        co2 = float(co2) if co2 is not None else None
        
        # ⭐ NEW: Extract Node 3 Soil Sensors from current_state (thread-safe read) with fallbacks
        with state_lock:
            node3_soil = current_state.get("soil_sensors", {})
            # Also check normalized_sensors just in case they're passed there
            # But primarily rely on current_state global since they come from different MQTT topic
        
        def get_node3_val(key, subkey=None):
            # Helper to get value from complex structure or direct value
            val = node3_soil.get(key)
            if isinstance(val, dict) and subkey:
                return val.get(subkey)
            return val

        # Extract specific Node 3 measurements
        s1_hum = get_node3_val("soil_1", "hum")
        s1_ph = get_node3_val("soil_1", "ph")
        s1_n = get_node3_val("soil_1", "n")
        s1_p = get_node3_val("soil_1", "p")
        s1_k = get_node3_val("soil_1", "k")
        s2_hum = get_node3_val("soil_2")  # Direct float
        s3_hum = get_node3_val("soil_3")  # Direct float
        s4_hum = get_node3_val("soil_4")  # Direct float
        
        # Ensure floats
        s1_hum = float(s1_hum) if s1_hum is not None else None
        s1_ph = float(s1_ph) if s1_ph is not None else None
        s1_n = float(s1_n) if s1_n is not None else None
        s1_p = float(s1_p) if s1_p is not None else None
        s1_k = float(s1_k) if s1_k is not None else None
        s2_hum = float(s2_hum) if s2_hum is not None else None
        s3_hum = float(s3_hum) if s3_hum is not None else None
        s4_hum = float(s4_hum) if s4_hum is not None else None

        # ⭐ REMOVED AGGRESSIVE OUTLIER REJECTION
        # It was causing "stuck" sensor values when the jump was > 20%
        # We rely on Hysteresis Margins in the logic below instead.
        
        relay_names = ['Pump 🌊', 'Fan 🌬️', 'Lamp 💡', 'Mist 💨', 'Plot Pump 2 💨', 'EvapPump 🔄', 'Valve1 P1 🚰', 'Valve2 P1 🚰', 'Valve3 P1 🚰', 'Valve1 P2 🚰', 'Valve2 P2 🚰', 'Valve3 P2 🚰']
        
        logger.info(f"🔍 AUTO Evaluation Start (Sensors: soil={soil_hum}%, temp={air_temp}°C, hum={air_hum}%, lux={lux}lux)")
        
        # BINARY LOGIC FOR ALL 12 RELAYS
        for relay_index in range(12):
            # ⭐ ATOMIC READ: Get mode and current state together
            with state_lock:
                mode = relay_modes.get(relay_index, 'MANUAL')
                current_relay_state = current_state["status"]["relays"][relay_index]  # Source of truth
            
            if mode != 'AUTO':
                continue
            
            if relay_index not in relay_configs or not relay_configs[relay_index]:
                logger.warning(f"❌ Relay {relay_index}: Config missing")
                continue
            
            config = relay_configs[relay_index]
            should_turn_on = False
            
            # DUAL SENSOR RELAY (Fan, Valve1 pair, etc.)
            if 'target1' in config:
                target1 = float(config.get('target1', 0))
                condition1 = str(config.get('condition1', '<')).strip()
                param1 = str(config.get('param1', 'temp')).strip()
                
                target2 = float(config.get('target2', 0))
                condition2 = str(config.get('condition2', '<')).strip()
                param2 = str(config.get('param2', 'hum')).strip()
                
                logic = str(config.get('logic', 'OR')).strip().upper()  # Default to OR

                sensor_dict = {
                    'soil_hum': soil_hum,       # Average of soil_1 & soil_2 (Node 1)
                    'soil_2_hum': soil_2_hum,   # Node 1 Soil 2 humidity (matches frontend param)
                    'temp': air_temp, 
                    'hum': air_hum, 
                    'lux': lux, 
                    'co2': co2,
                    'soil_2': soil_2_hum,       # Alias for backward compat
                    's1_hum': s1_hum,           # Node 3 S1 Hum
                    's1_ph': s1_ph,             # Node 3 S1 pH
                    's1_n': s1_n,               # Node 3 S1 N
                    's1_p': s1_p,               # Node 3 S1 P
                    's1_k': s1_k,               # Node 3 S1 K
                    's2_hum': s2_hum,           # Node 3 S2 Hum
                    's3_hum': s3_hum,           # Node 3 S3 Hum
                    's4_hum': s4_hum            # Node 3 S4 Hum
                }
                sensor_value1 = sensor_dict.get(param1)
                sensor_value2 = sensor_dict.get(param2)

                # ⭐ PARTIAL SENSOR DATA HANDLING:
                # If using OR logic, we only need ONE valid sensor to turn ON.
                # If using AND logic, we need BOTH.
                
                cond1 = False
                cond2 = False

                # Evaluate condition1
                if sensor_value1 is None:
                     cond1 = False # Treat missing as not meeting condition
                else:
                    margin1 = get_sensor_margin(param1)
                    if condition1 == '>':
                        if sensor_value1 > target1:
                            cond1 = True
                        elif sensor_value1 < (target1 - margin1):
                            cond1 = False
                        else:
                            cond1 = current_relay_state 
                    else:  # '<'
                        if sensor_value1 < target1:
                            cond1 = True
                        elif sensor_value1 > (target1 + margin1):
                            cond1 = False
                        else:
                            cond1 = current_relay_state

                # Evaluate condition2
                if sensor_value2 is None:
                     cond2 = False
                else:
                    margin2 = get_sensor_margin(param2)
                    if condition2 == '>':
                        if sensor_value2 > target2:
                            cond2 = True
                        elif sensor_value2 < (target2 - margin2):
                            cond2 = False
                        else:
                            cond2 = current_relay_state
                    else:  # '<'
                        if sensor_value2 < target2:
                            cond2 = True
                        elif sensor_value2 > (target2 + margin2):
                            cond2 = False
                        else:
                            cond2 = current_relay_state

                if logic == 'AND':
                    # Strict: need valid data for both
                    if sensor_value1 is None or sensor_value2 is None:
                         should_turn_on = False
                    else:
                         should_turn_on = cond1 and cond2
                else:  # 'OR'
                    # Loose: if either is True, ON. Even if other sensor is missing.
                    should_turn_on = cond1 or cond2
                
                logger.info(f"Relay {relay_index} (DUAL): {param1}={sensor_value1} {condition1} {target1} -> {cond1} | {param2}={sensor_value2} {condition2} {target2} -> {cond2} [Logic={logic}] => {should_turn_on}")

            
            # SINGLE SENSOR RELAY
            else:
                target = float(config.get('target', 0))
                condition = str(config.get('condition', '<')).strip()
                param = str(config.get('param', 'soil_hum')).strip()

                sensor_dict = {
                    'soil_hum': soil_hum,       # Average of soil_1 & soil_2 (Node 1)
                    'soil_2_hum': soil_2_hum,   # Node 1 Soil 2 humidity (matches frontend param)
                    'temp': air_temp, 
                    'hum': air_hum, 
                    'lux': lux, 
                    'co2': co2,
                    'soil_2': soil_2_hum,       # Alias for backward compat
                    's1_hum': s1_hum,           # Node 3 S1 Hum
                    's1_ph': s1_ph,             # Node 3 S1 pH
                    's1_n': s1_n,               # Node 3 S1 N
                    's1_p': s1_p,               # Node 3 S1 P
                    's1_k': s1_k,               # Node 3 S1 K
                    's2_hum': s2_hum,           # Node 3 S2 Hum
                    's3_hum': s3_hum,           # Node 3 S3 Hum
                    's4_hum': s4_hum            # Node 3 S4 Hum
                }
                sensor_value = sensor_dict.get(param)
                
                # Skip evaluation if required sensor is missing
                if sensor_value is None:
                    logger.warning(f"⚠️ Relay {relay_index}: Missing sensor data ({param}={sensor_value}). Skipping evaluation.")
                    continue
                
                # ⭐ GET SENSOR-SPECIFIC MARGIN (absolute hysteresis)
                margin = get_sensor_margin(param)
                
                # ⭐ ABSOLUTE MARGIN LOGIC: With hysteresis band
                # Prevents oscillation by using deadband zone with margin
                if condition == '>':
                    # For > condition: ON if above target, OFF if below (target - margin)
                    if sensor_value > target:
                        should_turn_on = True
                    elif sensor_value < (target - margin):
                        should_turn_on = False
                    else:
                        # In hysteresis zone: keep current state
                        should_turn_on = current_relay_state
                else:  # '<'
                    # For < condition: ON if below target, OFF if above (target + margin)
                    if sensor_value < target:
                        should_turn_on = True
                    elif sensor_value > (target + margin):
                        should_turn_on = False
                    else:
                        # In hysteresis zone: keep current state
                        should_turn_on = current_relay_state
                
                logger.info(f"Relay {relay_index}: {sensor_value} {condition} {target}±{margin} => {should_turn_on}")
            
            # ===== PULSE MODE OVERRIDE FOR VALVE RELAYS =====
            if relay_index in PULSE_RELAYS:
                should_turn_on = evaluate_pulse(relay_index, should_turn_on, current_relay_state)
                logger.info(f"🔄 PULSE Relay {relay_index}: phase={pulse_state[relay_index]['phase']} => {should_turn_on}")

            # ⭐⭐⭐ STRICT STATE CHECKING ⭐⭐⭐
            # ONLY publish MQTT if state ACTUALLY CHANGED
            # Compare new state against the KNOWN current state (source of truth)
            if should_turn_on != current_relay_state:
                # ⭐ ANTI-CHATTER GUARD: enforce minimum state hold time
                now_ts = time.time()
                min_hold = get_relay_min_hold_seconds(relay_index)
                last_change_ts = relay_state_change_time.get(relay_index, 0)
                elapsed = now_ts - last_change_ts if last_change_ts else 999999

                if min_hold > 0 and elapsed < min_hold:
                    logger.info(
                        f"⏳ HOLD GUARD: Relay {relay_index} change blocked "
                        f"({elapsed:.1f}s < {min_hold}s), keep state={current_relay_state}"
                    )
                    continue

                logger.info(f"STATE CHANGE DETECTED: Relay {relay_index} {current_relay_state} -> {should_turn_on}")
                
                # ⭐ ATOMIC UPDATE: Update state under lock BEFORE publishing
                with state_lock:
                    current_state["status"]["relays"][relay_index] = should_turn_on
                    relay_previous_state[relay_index] = should_turn_on
                    relay_state_change_time[relay_index] = time.time()
                
                # ⭐ PUBLISH MQTT: Now safe to publish because we already updated internal state
                # This ensures if the MQTT fails, we at least have tried
                # ⭐ ADD SOURCE SIGNATURE for debugging (per Gemini recommendation)
                control_msg = {
                    f"relay_{relay_index}": ("ON" if should_turn_on else "OFF"),
                    "source": "AUTO_EVAL",  # <--- Source signature to track origin
                    "timestamp": time.time()
                }
                try:
                    mqtt_result = mqtt_client.publish(MQTT_TOPIC_CONTROL, json.dumps(control_msg), qos=1)
                    if mqtt_result.rc != mqtt.MQTT_ERR_SUCCESS:
                        logger.error(f"⚠️ MQTT publish failed for relay {relay_index}: rc={mqtt_result.rc}")
                    else:
                        status_str = "ON ✅" if should_turn_on else "OFF ❌"
                        logger.info(f"📡 MQTT PUBLISHED: relay_{relay_index}={status_str} (source: AUTO_EVAL)")
                except Exception as mqtt_err:
                    logger.error(f"❌ MQTT publish error for relay {relay_index}: {mqtt_err}")
                
                # ⭐ LOG AUTO STATE CHANGE TO DB so continuous_backup.py reads correct state
                try:
                    with sqlite3.connect('../Database/smartfarm_myweb.db') as _conn:
                        _c = _conn.cursor()
                        _c.execute(
                            "INSERT INTO relay_history (timestamp, relay_index, state, mode) VALUES (?, ?, ?, ?)",
                            (get_current_timestamp(), relay_index, should_turn_on, "AUTO")
                        )
                        _conn.commit()
                except Exception as _db_err:
                    logger.warning(f"⚠️ Could not log AUTO relay state to DB: {_db_err}")

                # ⭐ Emit WebSocket event
                socketio.emit('relay_update', {
                    'relay_index': relay_index,
                    'state': should_turn_on,
                    'mode': mode,
                    'source': 'AUTO_EVAL'
                }, to=None)

                # ⭐ CRITICAL FIX: Emit status_update because frontend listens to THIS for UI updates
                # Without this, the diamond status indicator (◆) won't update until next refresh
                socketio.emit('status_update', build_status_payload(), to=None)
    except Exception as e:
        logger.error(f"❌ AUTO Mode Error: {e}")
        import traceback
        traceback.print_exc()
        logger.error(traceback.format_exc())


def on_mqtt_message(client, userdata, msg):
    """MQTT Message Handler - Enforces Server Authority"""
    global current_state
    try:
        topic = msg.topic
        payload_str = msg.payload.decode()
        payload = json.loads(payload_str)
        
        logger.info(f"📨 MQTT Message: topic={topic}, payload={payload_str[:100]}")  # ⭐ Log all messages
        
        if topic == MQTT_TOPIC_SENSORS:
            # Normalize data format (convert from MQTT to dashboard schema)
            normalized_payload = normalize_sensor_data(payload)

            # ✅ Update watchdog whenever MQTT message is received (ESP is connected)
            # Connectivity = receiving MQTT messages; value content does not affect this
            sensor_watchdog.update_sensor_data()

            # Update sensor data in RAM with thread safety
            with state_lock:
                current_state["sensors"] = normalized_payload
                current_state["status"]["last_update"] = datetime.now(BANGKOK_TZ).isoformat()
                current_state["status"]["esp32_status"] = sensor_watchdog.get_status_message()
            
            # Save to database asynchronously
            threading.Thread(target=save_sensor_data, args=(normalized_payload,), daemon=True).start()
            
            # Emit to all connected clients; _fresh = watchdog freshness (timeout-based only)
            socketio.emit('sensor_update', {**normalized_payload, "_fresh": sensor_watchdog.is_data_fresh}, to=None)
            logger.info(f"📡 Sensor Data Received: {payload} → Normalized: {normalized_payload}")
            
            # ⭐ NEW: Evaluate AUTO mode conditions and control relays
            threading.Thread(target=evaluate_auto_mode, args=(normalized_payload,), daemon=True).start()
            
        elif topic == "smartfarm/soil_sensors":
            # ⭐ NEW: Handle soil sensor data from Node 3
            logger.info(f"🌱 Soil Sensor Data Received: {payload}")
            
            with state_lock:
                # Store soil sensor data in current_state
                if "soil_sensors" not in current_state:
                    current_state["soil_sensors"] = {}
                
                # Update all soil sensor values
                for key in ["soil_1", "soil_2", "soil_3", "soil_4"]:
                    if key in payload:
                        current_state["soil_sensors"][key] = payload[key]
                
                current_state["status"]["last_update"] = datetime.now(BANGKOK_TZ).isoformat()
            
            # Save to database asynchronously
            threading.Thread(target=save_soil_sensor_data, args=(payload,), daemon=True).start()
            
            # Emit to all connected clients in real-time
            socketio.emit('soil_sensors_update', current_state["soil_sensors"], to=None)
            
            # ⭐ NEW: Trigger AUTO evaluation when soil sensors update
            # We pass current_state["sensors"] (last known air/env data) as context
            with state_lock:
                last_known_sensors = current_state.get("sensors", {})
            threading.Thread(target=evaluate_auto_mode, args=(last_known_sensors,), daemon=True).start()
            
        elif topic == "smartfarm/status":
            # ⭐⭐⭐ ENFORCE SERVER AUTHORITY ⭐⭐⭐
            # ONLY update the PHYSICAL relay states (what ESP32 actually reports)
            # DO NOT allow ESP32 to change: mode, config, or desired relay state
            logger.info(f"📡 ESP32 Status Message: {payload}")
            
            with state_lock:
                # ONLY accept physical relay feedback from ESP32
                if 'relays' in payload:
                    # Update ONLY physical feedback - not our desired state
                    reported_relays = payload['relays']
                    logger.info(f"✅ ESP32 Physical State: relays={reported_relays}")
                    # Note: We don't overwrite current_state['status']['relays'] here
                    # because that's our DESIRED state, not feedback from ESP32
                
                # ⭐ CRITICAL: IGNORE these fields - Server is authoritative
                if 'mode' in payload:
                    logger.warning(f"🚫 ESP32 tried to set 'mode'={payload.get('mode')} - BLOCKED! Server controls mode.")
                
                if 'config' in payload:
                    logger.warning(f"🚫 ESP32 tried to set 'config' - BLOCKED! Server controls config.")
                
                current_state["status"]["last_update"] = datetime.now(BANGKOK_TZ).isoformat()

            # Broadcast CURRENT server state to all clients (not what ESP32 sent)
            socketio.emit('status_update', build_status_payload(), to=None)
            logger.info(f"💡 Broadcast Server State (relay_modes={relay_modes})")
            
    except Exception as e:
        logger.error(f"❌ MQTT Message Error: {e}")

def on_mqtt_disconnect(client, userdata, rc):
    global mqtt_connected
    if rc != 0:
        mqtt_connected = False
        logger.warning(f"⚠️ Unexpected MQTT disconnection with code {rc}")

def start_mqtt_client():
    """Start MQTT client with retry loop — handles broker not-yet-ready at startup"""
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message
    mqtt_client.on_disconnect = on_mqtt_disconnect
    mqtt_client.reconnect_delay_set(min_delay=2, max_delay=30)

    def _connect_with_retry():
        while True:
            try:
                mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
                mqtt_client.loop_start()
                logger.info("🚀 MQTT Client Loop Started — connected to broker")
                return  # loop_start handles all future reconnections automatically
            except Exception as e:
                logger.error(f"❌ MQTT Connection Failed: {e} — retrying in 5s")
                time.sleep(5)

    threading.Thread(target=_connect_with_retry, daemon=True, name="mqtt-connect").start()

# --- REST API ENDPOINTS ---
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "server_time": datetime.now(BANGKOK_TZ).isoformat(),
        "mqtt_connected": mqtt_connected
    })

@socketio.on('connect')
def handle_connect():
    logger.info(f"🔗 Client connected: {request.sid}")
    # Send current state to new client (include freshness flag)
    emit('sensor_update', {**current_state["sensors"], "_fresh": sensor_watchdog.is_data_fresh})
    emit('status_update', build_status_payload())

@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f"🔌 Client disconnected: {request.sid}")

@socketio.on('request_state')
def handle_request_state():
    """Client can request full state at any time"""
    with state_lock:
        emit('sensor_update', {**current_state["sensors"], "_fresh": sensor_watchdog.is_data_fresh})
        emit('status_update', build_status_payload())

# --- API ROUTES ---
@app.route('/')
def index():
    return jsonify({
        "status": "running",
        "message": "Smart Farm Backend is Running",
        "version": "2.0 (SQLite + SocketIO)",
        "endpoints": {
            "current_state": "/api/data",
            "history": "/api/history",
            "control": "/api/control"
        }
    })

@app.route('/api/data', methods=['GET'])
def get_current_data():
    """Get current sensor and status data"""
    with state_lock:
        return jsonify(current_state)

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get last 50 sensor records for graph - reversed for chronological display"""
    try:
        limit = request.args.get('limit', 50, type=int)
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM sensors ORDER BY id DESC LIMIT ?", (limit,))
            rows = c.fetchall()
        
        # Convert rows to proper format
        history_data = []
        for row in rows:
            history_data.append({
                "id": row['id'],
                "timestamp": row['timestamp'],
                "air": {
                    "temp": row['air_temp'],
                    "hum": row['air_hum']
                },
                "soil_1": {
                    "hum": row['soil_1_hum'],
                    "ph": row['soil_1_ph'],
                    "n": row['soil_1_n'],
                    "p": row['soil_1_p'],
                    "k": row['soil_1_k']
                },
                "soil_2": {
                    "hum": row['soil_2_hum']
                },
                "env": {
                    "lux": row['env_lux'],
                    "co2": row['env_co2']
                }
            })
        
        # Reverse to get chronological order (oldest first)
        return jsonify(history_data[::-1])
        
    except Exception as e:
        logger.error(f"❌ History Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get current system status including MQTT connection and ESP32 sensor freshness"""
    try:
        # ⭐ CHECK SENSOR FRESHNESS
        is_fresh, watchdog_status = sensor_watchdog.check_sensor_status()
        
        with state_lock:
            status_info = {
                "sensors": current_state.get("sensors", {
                    "air": {"temp": 0, "hum": 0},
                    "soil_1": {"hum": 0},
                    "soil_2": {"hum": 0},
                    "env": {"lux": 0, "co2": 0}
                }),
                "mqtt_connected": mqtt_connected,
                "relays": current_state["status"]["relays"],
                "relay_modes": relay_modes,
                "mode": current_state["status"]["mode"],
                "last_update": current_state["status"]["last_update"],
                "esp32_status": current_state["status"]["esp32_status"],  # ⭐ ESP32 connection status
                "sensor_fresh": is_fresh,  # ⭐ Sensor data freshness
                "watchdog_info": watchdog_status,  # ⭐ Detailed watchdog info
                "server_time": datetime.now(BANGKOK_TZ).isoformat()
            }
        
        logger.info(f"📊 Status Request: MQTT={mqtt_connected}, ESP32={is_fresh}, Relays={status_info['relays']}")
        return jsonify(status_info)
        
    except Exception as e:
        logger.error(f"❌ Status Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/esp32-status', methods=['GET'])
def get_esp32_status():
    """Get ESP32 sensor data freshness status"""
    try:
        is_fresh, watchdog_status = sensor_watchdog.check_sensor_status()
        
        return jsonify({
            "esp32_connected": is_fresh,
            "status_message": sensor_watchdog.get_status_message(),
            "last_update_time": watchdog_status['last_update_time'],
            "seconds_since_update": watchdog_status['seconds_since_update'],
            "timeout_seconds": watchdog_status['timeout_seconds'],
            "reason": watchdog_status['reason']
        })
    except Exception as e:
        logger.error(f"❌ ESP32 Status Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/control', methods=['POST'])
def control_relay():
    """Control relay via MQTT and update database - FORCES MANUAL MODE"""
    global relay_modes, relay_previous_state
    try:
        data = request.json
        relay_index = data.get('index', data.get('relay_index', 0))  # Support both key names - check 'index' first
        
        # ⭐ FIX: Robust boolean parsing - handle bool, int, string inputs
        # Supports: True/False (bool), 1/0 (int), "true"/"false" (string), "1"/"0" (string)
        raw_state = data.get('state', data.get('value', False))
        if isinstance(raw_state, bool):
            relay_state = raw_state
        else:
            relay_state = str(raw_state).lower() in ['true', '1', 't', 'y', 'yes']
        
        logger.info(f"🎮 Relay Control Request: Relay {relay_index} → {'ON' if relay_state else 'OFF'} (raw: {raw_state}, parsed: {relay_state})")
        
        # Validate input
        if not isinstance(relay_index, int) or relay_index not in range(0, 12):
            return jsonify({"status": "error", "message": "Invalid relay index (must be 0-11)"}), 400
        
        # ⭐ CRITICAL: Force mode to MANUAL when user manually controls relay
        # This PREVENTS auto_mode loop from overwriting the command
        with state_lock:
            relay_modes[relay_index] = 'MANUAL'
            current_state["status"]["relays"][relay_index] = relay_state
            # ⭐ CRITICAL: Sync relay_previous_state so AUTO won't re-trigger
            # This prevents the next sensor update from changing the relay immediately
            relay_previous_state[relay_index] = relay_state

        # Log that we forced MANUAL along with a short stack trace to identify callers
        stack_info = "".join(traceback.format_stack(limit=6))
        logger.warning(f"🔒 FORCED Relay {relay_index} mode to MANUAL (manual control priority)\nCall stack:\n{stack_info}")
        logger.info(f"🔒 Synced relay_previous_state[{relay_index}] = {relay_state}")
        
        # ⭐ Publish to MQTT in ESP32-compatible format
        # ESP32 expects: {"relay_0": "ON", "relay_1": "OFF", ...}
        # ⭐ ADD SOURCE SIGNATURE for debugging (per Gemini recommendation)
        mqtt_payload = {
            f"relay_{relay_index}": ("ON" if relay_state else "OFF"),
            "source": "MANUAL_API",  # <--- Source signature to track origin
            "timestamp": time.time()
        }
        publish_result = mqtt_client.publish(MQTT_TOPIC_CONTROL, json.dumps(mqtt_payload), qos=1)
        logger.info(f"📡 MQTT Published to ESP32: relay_{relay_index}={'ON' if relay_state else 'OFF'} (source: MANUAL_API | Result: {publish_result.rc})")
        
        # Log relay action
        try:
            with sqlite3.connect(DB_NAME) as conn:
                c = conn.cursor()
                c.execute("INSERT INTO relay_history (timestamp, relay_index, state, mode) VALUES (?, ?, ?, ?)",
                         (get_current_timestamp(), relay_index, relay_state, "MANUAL"))
                conn.commit()
                logger.info(f"📝 Relay history logged: Relay {relay_index} → {relay_state}")
        except Exception as e:
            logger.warning(f"⚠️ Could not log relay action: {e}")
        
        # Broadcast status update with mode info
        socketio.emit('status_update', build_status_payload(), to=None)
        logger.info(f"✅ Status broadcasted to all clients")
        
        logger.info(f"🔌 Relay {relay_index} set to {relay_state} (Mode: MANUAL)")
        return jsonify({
            "status": "success",
            "message": f"Relay {relay_index} {'ON' if relay_state else 'OFF'} (MANUAL mode)",
            "relay": relay_index,
            "value": relay_state,
            "mode": "MANUAL"
        })
        
    except Exception as e:
        logger.error(f"❌ Control Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/relay-modes', methods=['GET'])
def get_relay_modes():
    """Get current relay modes (MANUAL/AUTO)"""
    logger.info(f"📋 GET relay-modes: {relay_modes}")
    return jsonify(relay_modes)

@app.route('/api/relay-modes', methods=['POST'])
def set_relay_modes():
    """Set relay mode (MANUAL or AUTO) for one or more relays"""
    global relay_modes, relay_previous_state, current_state
    try:
        data = request.json
        
        # ⭐ SUPPORT BOTH: Single relay (index+mode) OR batch (relay_modes dict)
        if 'relay_modes' in data and isinstance(data['relay_modes'], dict):
            # Batch mode - set multiple relays at once
            relay_modes_dict = data['relay_modes']
            results = {}
            
            for relay_id, mode in relay_modes_dict.items():
                try:
                    relay_index = int(relay_id)
                    mode = str(mode).upper()
                    
                    if relay_index not in range(0, 12):
                        results[relay_id] = {"status": "error", "message": f"Invalid relay index {relay_index}"}
                        continue
                    
                    if mode not in ['MANUAL', 'AUTO']:
                        results[relay_id] = {"status": "error", "message": f"Invalid mode {mode}"}
                        continue
                    
                    # ⭐ PUMP (RELAY 0): FORCE MANUAL MODE ONLY
                    if relay_index == 0 and mode != 'MANUAL':
                        results[relay_id] = {"status": "error", "message": "Pump (Relay 0) only supports MANUAL mode"}
                        continue

                    # ⭐ PLOT VALVES (RELAY 6-11): FORCE MANUAL MODE ONLY (Requested by User)
                    if relay_index in [6, 7, 8, 9, 10, 11] and mode != 'MANUAL':
                         results[relay_id] = {"status": "error", "message": f"Relay {relay_index} is forced to MANUAL mode only"}
                         continue
                    
                    # Update mode
                    old_mode = relay_modes.get(relay_index, 'MANUAL')
                    if old_mode != mode:
                        with state_lock:
                            current_state["status"]["relays"][relay_index] = False
                            relay_previous_state[relay_index] = None
                            relay_modes[relay_index] = mode
                            relay_state_change_time[relay_index] = 0
                        
                        # Reset relay via MQTT
                        mqtt_payload = {f"relay_{relay_index}": "OFF"}
                        mqtt_client.publish(MQTT_TOPIC_CONTROL, json.dumps(mqtt_payload), qos=1)
                        
                        logger.info(f"⚙️ Relay {relay_index}: {old_mode} → {mode}")
                        results[relay_id] = {"status": "success", "message": f"Mode changed to {mode}"}
                    else:
                        results[relay_id] = {"status": "success", "message": f"Already in {mode} mode"}
                except Exception as e:
                    results[relay_id] = {"status": "error", "message": str(e)}
            
            return jsonify({"status": "success", "results": results}), 200
        
        else:
            # Single relay mode (legacy format)
            relay_index = data.get('index', 0)
            mode = data.get('mode', 'MANUAL').upper()
            
            if relay_index not in range(0, 12):
                return jsonify({"status": "error", "message": "Invalid relay index (must be 0-11)"}), 400
            
            if mode not in ['MANUAL', 'AUTO']:
                return jsonify({"status": "error", "message": "Mode must be MANUAL or AUTO"}), 400
            
            # ⭐ PUMP (RELAY 0): FORCE MANUAL MODE ONLY
            if relay_index == 0:
                if mode != 'MANUAL':
                    logger.warning(f"🔒 Pump (Relay 0): AUTO mode requested but BLOCKED - Pump must be MANUAL only")
                    return jsonify({
                        "status": "error",
                        "message": "Pump (Relay 0) only supports MANUAL mode. AUTO mode is not available.",
                        "relay": 0
                    }), 400


            # ⭐ RESET RELAY STATE WHEN SWITCHING MODES (Clear previous settings)
            old_mode = relay_modes.get(relay_index, 'MANUAL')
            if old_mode != mode:
                # Mode changed - reset relay to OFF and clear state
                with state_lock:
                    current_state["status"]["relays"][relay_index] = False
                    # ⭐ CRITICAL: Reset relay_previous_state to UNKNOWN (None) to force evaluation
                    # This ensures the next evaluate_auto_mode() iteration triggers an MQTT publish
                    relay_previous_state[relay_index] = None  # None = "unknown state, needs evaluation"
                    # ⭐ CRITICAL: Change mode AFTER resetting state to avoid race
                    relay_modes[relay_index] = mode
                # ⭐ ADDITIONAL FIX: Also reset cooldown timer when switching modes
                relay_state_change_time[relay_index] = 0  # Reset cooldown so mode change takes effect immediately

            # ⭐ SAVE MODE CHANGE TO DATABASE (relay_history table)
            try:
                conn = sqlite3.connect('../Database/smartfarm_myweb.db')
                c = conn.cursor()
                timestamp = datetime.now(ZoneInfo("Asia/Bangkok")).strftime("%Y-%m-%d %H:%M:%S")
                c.execute("""
                    INSERT INTO relay_history (relay_index, state, mode, timestamp)
                    VALUES (?, ?, ?, ?)
                """, (relay_index, False, mode, timestamp))
                conn.commit()
                conn.close()
                logger.info(f"✅ Saved to DB: Relay {relay_index} mode={mode}, state=OFF, time={timestamp}")
            except Exception as db_err:
                logger.error(f"❌ Database error saving relay mode: {db_err}")

            # Log mode change with stack trace for debugging unexpected transitions
            stack_info = "".join(traceback.format_stack(limit=6))
            logger.warning(f"⚙️ Relay {relay_index} mode changed {old_mode} -> {mode} (via /api/relay-modes)\nCall stack:\n{stack_info}")
            
            # ⭐ Send OFF command to ESP32 in correct format
            mqtt_payload = {f"relay_{relay_index}": "OFF"}
            mqtt_client.publish(MQTT_TOPIC_CONTROL, json.dumps(mqtt_payload), qos=1)
            logger.info(f"🔄 Mode switch reset: Relay {relay_index} OFF ({old_mode} → {mode})")
            logger.info(f"🔄 Synced relay_previous_state[{relay_index}] = False")
            
            relay_names = ['Pump 🌊', 'Fan 🌬️', 'Lamp 💡', 'Mist 💨', 'Plot Pump 2 💨', 'EvapPump 🔄', 'Valve1 P1 🚰', 'Valve2 P1 🚰', 'Valve3 P1 🚰', 'Valve1 P2 🚰', 'Valve2 P2 🚰', 'Valve3 P2 🚰']
            logger.info(f"⚙️ Relay {relay_index} ({relay_names[relay_index]}) mode changed to {mode}")
            
            # ⭐ REMOVED: Do NOT run AUTO evaluation immediately after mode switch
            # This was causing race conditions and unwanted toggles
            # Instead, let the next sensor update naturally trigger AUTO evaluation
            # with the new mode setting already in place
            
            # Broadcast updated status to all clients with relay_modes
            socketio.emit('status_update', build_status_payload(), to=None)
            
            return jsonify({
                "status": "success",
                "relay": relay_index,
                "mode": mode,
                "message": "Mode changed and relay reset to OFF"
            })
    except Exception as e:
        logger.error(f"❌ Relay Mode Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/test-auto-evaluation', methods=['POST'])
def test_auto_evaluation():
    """DEBUGGING ENDPOINT: Manually trigger AUTO mode evaluation with current sensor data"""
    global current_state
    logger.info("\n\n=== 🔍 TEST AUTO EVALUATION ENDPOINT ===")
    logger.info(f"Current relay_modes: {relay_modes}")
    logger.info(f"Current relay_configs: {relay_configs}")
    logger.info(f"Current sensors: {current_state['sensors']}")
    
    # Call evaluate_auto_mode with current sensor data
    evaluate_auto_mode(current_state['sensors'])
    
    return jsonify({
        "status": "success",
        "message": "AUTO evaluation triggered",
        "modes": relay_modes,
        "configs": relay_configs,
        "sensors": current_state['sensors']
    })

@app.route('/api/relay-configs', methods=['GET'])
def get_relay_configs():
    """Get all relay configurations for AUTO mode WITH current sensor values"""
    global relay_configs
    
    logger.info(f"📋 GET /api/relay-configs called")
    logger.info(f"   relay_configs[0] BEFORE load: {relay_configs[0]}")
    
    # ⭐ Reload from database every time to ensure we have latest saved values
    load_relay_configs_from_db()
    
    logger.info(f"   relay_configs[0] AFTER load: {relay_configs[0]}")
    logger.info(f"📋 GET relay-configs: {relay_configs}")
    
    # Get current sensor values
    with state_lock:
        sensors = current_state["sensors"].copy()
        node3_soil = current_state.get("soil_sensors", {}).copy()
    
    # Prepare response with both config and current values
    response = {}
    for relay_index in range(12):
        config = relay_configs[relay_index]
        
        # Get current sensor value based on config
        if 'target1' in config:  # Dual sensor (relay 1, 6, 9 etc.)
            param1 = config.get('param1', 'temp')
            param2 = config.get('param2', 'hum')
            
            # Get values for both sensors
            value1 = get_sensor_value(sensors, node3_soil, param1)
            value2 = get_sensor_value(sensors, node3_soil, param2)
            
            response[relay_index] = {
                **config,
                'current_value1': round(value1, 2) if value1 is not None else 0,
                'current_value2': round(value2, 2) if value2 is not None else 0,
                'sensor1_name': param1,
                'sensor2_name': param2
            }
        else:  # Single sensor
            param = config.get('param', 'soil_hum')
            current_value = get_sensor_value(sensors, node3_soil, param)
            
            response[relay_index] = {
                **config,
                'current_value': round(current_value, 2) if current_value is not None else 0,
                'sensor_name': param
            }
    
    logger.info(f"📊 Returning configs with current values: {response}")
    return jsonify(response)

def get_sensor_value(sensors, node3_soil, param):
    """Helper function to extract sensor value by parameter name"""
    if param == 'soil_hum':
        # Average of soil_1 and soil_2
        soil_1_hum = sensors.get('soil_1', {}).get('hum', 0)
        soil_2_hum = sensors.get('soil_2', {}).get('hum', 0)
        if soil_1_hum and soil_2_hum:
            return (soil_1_hum + soil_2_hum) / 2
        return soil_1_hum or soil_2_hum or 0
    elif param == 'soil_2':
        return sensors.get('soil_2', {}).get('hum', 0)
    elif param == 'temp':
        return sensors.get('air', {}).get('temp', 0)
    elif param == 'hum':
        return sensors.get('air', {}).get('hum', 0)
    elif param == 'lux':
        return sensors.get('env', {}).get('lux', 0)
    elif param == 'co2':
        return sensors.get('env', {}).get('co2', 0)
    # Node 3 Sensors
    elif param == 's1_hum':
        val = node3_soil.get('soil_1')
        return val.get('hum', 0) if isinstance(val, dict) else (val or 0)
    elif param == 's1_ph':
        val = node3_soil.get('soil_1')
        return val.get('ph', 0) if isinstance(val, dict) else 0
    elif param == 's1_n':
        val = node3_soil.get('soil_1')
        return val.get('n', 0) if isinstance(val, dict) else 0
    elif param == 's1_p':
        val = node3_soil.get('soil_1')
        return val.get('p', 0) if isinstance(val, dict) else 0
    elif param == 's1_k':
        val = node3_soil.get('soil_1')
        return val.get('k', 0) if isinstance(val, dict) else 0
    elif param == 's2_hum':
        val = node3_soil.get('soil_2')
        return val if isinstance(val, (int, float)) else 0
    elif param == 's3_hum':
        val = node3_soil.get('soil_3')
        return val if isinstance(val, (int, float)) else 0
    elif param == 's4_hum':
        val = node3_soil.get('soil_4')
        return val if isinstance(val, (int, float)) else 0
    
    return 0

@app.route('/api/relay-configs', methods=['POST'])
def set_relay_config():
    """Set relay configuration for AUTO mode and broadcast to ESP32"""
    global relay_configs
    import sys
    logger.critical(f"🚨 SET_RELAY_CONFIG FUNCTION CALLED! - About to process POST request")
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        data = request.json
        relay_index = data.get('index', 0)
        
        logger.info(f"")
        logger.info(f"╔════════════════════════════════════════════════════════╗")
        logger.info(f"║          🔧 RELAY CONFIG SAVE TRACE START             ║")
        logger.info(f"╚════════════════════════════════════════════════════════╝")
        logger.info(f"🔧 POST /api/relay-configs - Received full data: {data}")
        logger.info(f"   relay_index = {relay_index}")
        logger.info(f"   data keys = {list(data.keys())}")
        
        if relay_index not in range(0, 12):
            return jsonify({"status": "error", "message": "Invalid relay index (must be 0-11)"}), 400
        
        # Check if it's dual sensor config (relay 1, 6, 9 etc.)
        if 'target1' in data:
            # Dual sensor config
            target1 = data.get('target1', 0)
            condition1 = data.get('condition1', '<')
            param1 = data.get('param1', 'temp')
            
            target2 = data.get('target2', 0)
            condition2 = data.get('condition2', '<')
            param2 = data.get('param2', 'hum')
            
            logic = data.get('logic', 'OR')
            
            valid_params = ['soil_hum', 'soil_2_hum', 'temp', 'hum', 'lux', 'co2', 'soil_2', 's1_hum', 's1_ph', 's1_n', 's1_p', 's1_k', 's2_hum', 's3_hum', 's4_hum']
            if param1 not in valid_params or param2 not in valid_params:
                return jsonify({"status": "error", "message": f"Parameter must be one of {valid_params}"}), 400
            
            if condition1 not in ['<', '>'] or condition2 not in ['<', '>']:
                return jsonify({"status": "error", "message": "Condition must be < or >"}), 400
            
            if logic not in ['OR', 'AND']:
                return jsonify({"status": "error", "message": "Logic must be OR or AND"}), 400
            
            # Update dual sensor configuration
            relay_configs[relay_index] = {
                'target1': target1,
                'condition1': condition1,
                'param1': param1,
                'target2': target2,
                'condition2': condition2,
                'param2': param2,
                'logic': logic
            }
            
            logger.info(f"🔧 AUTO Config Updated - Fan (Dual): ({param1} {condition1} {target1}) {logic} ({param2} {condition2} {target2})")
            logger.info(f"📊 Full relay_configs dict AFTER update: {relay_configs}")
            
        else:
            # Single sensor config
            target = data.get('target', 0)
            condition = data.get('condition', '<')
            param = data.get('param', 'soil_hum')

            logger.info(f"")
            logger.info(f"   📥 STEP 1: Extract from POST")
            logger.info(f"      target   = {target!r} (type: {type(target).__name__})")
            logger.info(f"      condition = {condition!r} (type: {type(condition).__name__})")
            logger.info(f"      param    = {param!r} (type: {type(param).__name__})")
            
            if condition not in ['<', '>']:
                logger.error(f"❌ Invalid condition: {condition!r} (expected '<' or '>')")
                return jsonify({"status": "error", "message": "Condition must be < or >"}), 400
            
            valid_params = ['soil_hum', 'soil_2_hum', 'temp', 'hum', 'lux', 'co2', 'soil_2', 's1_hum', 's1_ph', 's1_n', 's1_p', 's1_k', 's2_hum', 's3_hum', 's4_hum']
            if param not in valid_params:
                return jsonify({"status": "error", "message": f"Parameter must be one of {valid_params}"}), 400
            
            # Build config BEFORE saving
            relay_configs[relay_index] = {
                'target': float(target),
                'condition': str(condition).strip(),
                'param': param
            }
            
            logger.info(f"")
            logger.info(f"   📝 STEP 2: Built in relay_configs[{relay_index}]")
            logger.info(f"      relay_configs[{relay_index}] = {relay_configs[relay_index]}")
            logger.info(f"      condition value in memory = {relay_configs[relay_index]['condition']!r}")
            
            relay_names = ['Pump 🌊', 'Fan 🌬️', 'Lamp 💡', 'Mist 💨']
            logger.info(f"      Summary: IF {param} {condition} {float(target)} THEN Relay ON")
        
        # ⭐ CRITICAL: Only reset state if relay is in AUTO mode
        # Don't force mode changes during config save
        with state_lock:
            current_mode = relay_modes.get(relay_index, 'MANUAL')
            
            # Only reset cooldown if in AUTO mode - saves should be lightweight
            if current_mode == 'AUTO':
                relay_previous_state[relay_index] = None  # Force fresh evaluation
                relay_state_change_time[relay_index] = 0  # Reset cooldown so relay responds immediately
                logger.info(f"🔄 Reset relay_previous_state[{relay_index}] = None (relay is AUTO)")
                logger.info(f"⏱️ Reset cooldown timer - relay can toggle immediately")
            else:
                logger.info(f"ℹ️  Relay {relay_index} is MANUAL mode - skipping state reset")
        
        logger.info(f"⚡ CRITICAL FIX: Next AUTO evaluation will use new config")
        
        # ⭐ CRITICAL: Save config to database for persistence
        logger.info(f"")
        logger.info(f"   💾 STEP 3: Saving to Database")
        logger.info(f"      About to save: {relay_configs[relay_index]}")
        save_relay_config_to_db(relay_index, relay_configs[relay_index])
        
        logger.info(f"")
        logger.info(f"   📖 STEP 4: Verify load from Database")
        # Read back immediately from DB
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute("SELECT config FROM relay_configs_db WHERE relay_index = ?", (relay_index,))
            result = c.fetchone()
            if result:
                verified_config = json.loads(result[0])
                logger.info(f"      ✅ Read back from DB: {verified_config}")
                logger.info(f"      condition in DB = {verified_config.get('condition')!r}")
                if verified_config.get('condition') != relay_configs[relay_index].get('condition'):
                    logger.error(f"      🚨 MISMATCH! Saved: {relay_configs[relay_index].get('condition')!r}, Got back: {verified_config.get('condition')!r}")
        
        logger.info(f"📊 relay_configs global AFTER save: relay_configs[{relay_index}] = {relay_configs[relay_index]}")
        logger.info(f"📊 Full relay_configs dict: {relay_configs}")
        
        # ⭐⭐⭐ CRITICAL: Send config to ESP32 via MQTT ⭐⭐⭐
        config_msg = {
            "type": "CONFIG",
            "index": relay_index,
            **relay_configs[relay_index]  # Spread the config dict
        }
        mqtt_client.publish("smartfarm/config", json.dumps(config_msg), qos=1)
        logger.info(f"📡 Sent config to ESP32: {config_msg}")
        
        logger.info(f"✅ Config saved - relay_configs[{relay_index}]: {relay_configs[relay_index]}")
        
        # ⭐ IMMEDIATE EVALUATION: Don't wait for next sensor data
        # Trigger evaluate_auto_mode() immediately with current sensor values
        logger.info(f"⚡ IMMEDIATE EVALUATION: Triggering evaluate_auto_mode() NOW for relay {relay_index}")
        try:
            with state_lock:
                sensors_snapshot = copy.deepcopy(current_state.get("sensors", {}))
            threading.Thread(target=evaluate_auto_mode, args=(sensors_snapshot,), daemon=True).start()
            logger.info(f"✅ Evaluation thread started")
        except Exception as e:
            logger.error(f"❌ Failed to start evaluation thread: {e}")
        
        logger.info(f"╔════════════════════════════════════════════════════════╗")
        logger.info(f"║          🔧 RELAY CONFIG SAVE TRACE END               ║")
        logger.info(f"╚════════════════════════════════════════════════════════╝")
        logger.info(f"")
        
        return jsonify({
            "status": "success",
            "relay": relay_index,
            "config": relay_configs[relay_index],
            "message": "Config updated and sent to ESP32"
        })
    except Exception as e:
        logger.error(f"❌ Relay Config Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ===== CONTINUOUS MOCK SENSOR PUBLISHER =====
CONTINUOUS_MOCK_ENABLED = True
mock_publisher_thread = None

def continuous_mock_sensor_publisher():
    """Publish mock sensor data every 0.5 seconds to simulate Node1 - FAST RESPONSE"""
    global CONTINUOUS_MOCK_ENABLED
    last_publish = time.time()
    last_status_check = 0  # Force immediate check
    sensor_is_fresh = False
    prev_is_fresh = False          # Track previous state to detect transition
    last_stale_broadcast = 0      # Last time we broadcast _fresh=False
    
    while CONTINUOUS_MOCK_ENABLED:
        try:
            now = time.time()
            
            # Check sensor status frequently (every 1s) to avoid race conditions
            # Also check if we just got an update from MQTT
            is_fresh, status = sensor_watchdog.check_sensor_status()
            
            # Additional check: If last_update_time is very recent (< 2s), it's definitely fresh
            if sensor_watchdog.last_update_time and (now - sensor_watchdog.last_update_time < 2):
                is_fresh = True
                
            sensor_is_fresh = is_fresh

            # ⭐ DISCONNECT DETECTION: broadcast _fresh=False when ESP goes stale
            if prev_is_fresh and not is_fresh:
                # Transition: fresh → stale  (ESP just disconnected)
                logger.warning("⚠️ ESP32 disconnected — broadcasting _fresh=False to all clients")
                with state_lock:
                    stale_payload = dict(current_state["sensors"])
                stale_payload["_fresh"] = False
                socketio.emit('sensor_update', stale_payload, to=None)
                last_stale_broadcast = now

            # ⭐ RECONNECT DETECTION: broadcast _fresh=True when ESP comes back
            if not prev_is_fresh and is_fresh:
                # Transition: stale → fresh (ESP reconnected)
                logger.info("✅ ESP32 reconnected — broadcasting _fresh=True and status update to all clients")
                with state_lock:
                    fresh_payload = dict(current_state["sensors"])
                fresh_payload["_fresh"] = True
                socketio.emit('sensor_update', fresh_payload, to=None)
                socketio.emit('status_update', build_status_payload(), to=None)

            # Also re-broadcast every 1s while stale (real-time disconnection detection)
            if not is_fresh and (now - last_stale_broadcast >= 1):
                with state_lock:
                    stale_payload = dict(current_state["sensors"])
                stale_payload["_fresh"] = False
                socketio.emit('sensor_update', stale_payload, to=None)
                socketio.emit('status_update', build_status_payload(), to=None)
                last_stale_broadcast = now

            prev_is_fresh = is_fresh

            if now - last_status_check >= 1.0:
                last_status_check = now
                if not is_fresh:
                     with state_lock:
                        current_state["status"]["esp32_status"] = "DISCONNECTED"

            if now - last_publish >= 0.5:
                last_publish = now

                # ⭐ CRITICAL FIX: If real ESP32 data is fresh, do NOT run mock evaluation.
                if sensor_is_fresh:
                    # Do nothing, let real data drive the system
                    time.sleep(0.1)
                    continue

                # Only proceed if sensors are NOT fresh

                
                # ⭐ DO NOT update watchdog here - only update from real MQTT data (on_mqtt_message)
                # This allows watchdog to detect real ESP32 disconnections
                
                # Generate varying mock data
                test_payload = {
                    "air": {
                        "temp": 25.0 + random.uniform(-5, 5),
                        "hum": 65.0 + random.uniform(-10, 10)
                    },
                    "soil_1": {
                        "hum": 45.0 + random.uniform(-15, 15),
                        "temp": 22.0,
                        "ph": 6.8,
                        "n": 150,
                        "p": 30,
                        "k": 200
                    },
                    "soil_2": {
                        "hum": 50.0 + random.uniform(-15, 15)
                    },
                    "env": {
                        "lux": 250.0 + random.uniform(-100, 100),
                        "co2": 450 + random.uniform(-50, 50)
                    }
                }
                
                # Process through evaluate_auto_mode
                threading.Thread(target=evaluate_auto_mode, args=(test_payload,), daemon=True).start()
                logger.debug(f"🔄 Auto-published mock data: air_temp={test_payload['air']['temp']:.1f}°C, soil_hum={test_payload['soil_1']['hum']:.1f}%")
        except Exception as e:
            logger.error(f"❌ Error in mock publisher: {e}")
        
        time.sleep(0.1)

# --- MAIN EXECUTION ---

# ─── Backup-file parse helpers (new 6-line format) ───────────────────────────
def _parse_env_line(content, sensors):
    """ENV line: AirTemp:29.0C AirHum:61% Light:101lux CO2:768ppm"""
    import re
    m = re.search(r'AirTemp:([\d.]+)', content);    sensors['temp']     = float(m.group(1)) if m else sensors.get('temp')
    m = re.search(r'AirHum:([\d.]+)',  content);    sensors['humidity'] = float(m.group(1)) if m else sensors.get('humidity')
    m = re.search(r'Light:([\d.]+)',   content);    sensors['lux']      = float(m.group(1)) if m else sensors.get('lux')
    m = re.search(r'CO2:([\d.]+)',     content);    sensors['co2']      = float(m.group(1)) if m else sensors.get('co2')

def _parse_z1_line(content, sensors):
    """Z1 line: SoilMoist1 แปลง1:87% SoilMoist2 แปลง1:62% SoilMoist3 แปลง1:27% pH แปลง1:7.1 N:77 P:224 K:218"""
    import re
    m = re.search(r'SoilMoist1 \u0e41\u0e1b\u0e25\u0e071:([\d.]+)%', content); sensors['soil_1']       = float(m.group(1)) if m else sensors.get('soil_1')
    m = re.search(r'SoilMoist2 \u0e41\u0e1b\u0e25\u0e071:([\d.]+)%', content); sensors['soil_2']       = float(m.group(1)) if m else sensors.get('soil_2')
    m = re.search(r'SoilMoist3 \u0e41\u0e1b\u0e25\u0e071:([\d.]+)%', content); sensors['node3_s2_hum'] = float(m.group(1)) if m else sensors.get('node3_s2_hum')
    m = re.search(r'pH \u0e41\u0e1b\u0e25\u0e071:([\d.]+)',          content); sensors['soil_1_ph']    = float(m.group(1)) if m else sensors.get('soil_1_ph')
    m = re.search(r'N:([\d.]+)',  content);    sensors['soil_1_n'] = float(m.group(1)) if m else sensors.get('soil_1_n')
    m = re.search(r'P:([\d.]+)',  content);    sensors['soil_1_p'] = float(m.group(1)) if m else sensors.get('soil_1_p')
    m = re.search(r'K:([\d.]+)',  content);    sensors['soil_1_k'] = float(m.group(1)) if m else sensors.get('soil_1_k')

def _parse_z2_line(content, sensors):
    """Z2 line: SoilMoist1 แปลง2:67% SoilMoist2 แปลง2:26% SoilMoist3 แปลง2:10% pH แปลง2:5.5 N:62 P:191 K:185"""
    import re
    m = re.search(r'SoilMoist1 \u0e41\u0e1b\u0e25\u0e072:([\d.]+)%', content); sensors['node3_s1_hum'] = float(m.group(1)) if m else sensors.get('node3_s1_hum')
    m = re.search(r'SoilMoist2 \u0e41\u0e1b\u0e25\u0e072:([\d.]+)%', content); sensors['node3_s3_hum'] = float(m.group(1)) if m else sensors.get('node3_s3_hum')
    m = re.search(r'SoilMoist3 \u0e41\u0e1b\u0e25\u0e072:([\d.]+)%', content); sensors['node3_s4_hum'] = float(m.group(1)) if m else sensors.get('node3_s4_hum')
    m = re.search(r'pH \u0e41\u0e1b\u0e25\u0e072:([\d.]+)',          content); sensors['node3_s1_ph']  = float(m.group(1)) if m else sensors.get('node3_s1_ph')
    m = re.search(r'N:([\d.]+)',  content);    sensors['node3_s1_n'] = float(m.group(1)) if m else sensors.get('node3_s1_n')
    m = re.search(r'P:([\d.]+)',  content);    sensors['node3_s1_p'] = float(m.group(1)) if m else sensors.get('node3_s1_p')
    m = re.search(r'K:([\d.]+)',  content);    sensors['node3_s1_k'] = float(m.group(1)) if m else sensors.get('node3_s1_k')

def _parse_relay_new_line(content, relays):
    """Parse new-format relay line (Thai names) and store under old English keys for compatibility"""
    import re
    _MAP = {
        'พัดลม': 'Fan', 'ไฟส่องสว่าง': 'Lamp', 'พ่นหมอก': 'Mist', 'ปั้มEvap': 'EvapPump',
        'ปั้มแปลง1': 'Pump',
        'วาล์ว1-แปลง1': 'V1-P1', 'วาล์ว2-แปลง1': 'V2-P1', 'วาล์ว3-แปลง1': 'V3-P1',
        'ปั้มแปลง2': 'Plot Pump 2',
        'วาล์ว1-แปลง2': 'V1-P2', 'วาล์ว2-แปลง2': 'V2-P2', 'วาล์ว3-แปลง2': 'V3-P2',
    }
    for thai, eng in _MAP.items():
        m = re.search(rf'{re.escape(thai)}:([A-Z]+)/([A-Z]+)', content)
        if m:
            relays[eng] = {'state': m.group(1), 'mode': m.group(2)}
# ─── SQL-backed data helpers (replaces DATABASE_BACKUP.txt parsing) ──────────

# Relay index → frontend key mapping (must match DataTablePage.jsx RELAY_COLS)
_RELAY_IDX_NAME = {
    0: 'Pump', 1: 'Fan', 2: 'Lamp', 3: 'Mist',
    4: 'Plot Pump 2', 5: 'EvapPump',
    6: 'V1-P1', 7: 'V2-P1', 8: 'V3-P1',
    9: 'V1-P2', 10: 'V2-P2', 11: 'V3-P2',
}

def _relay_snapshot_at(cur, ts_str):
    """Return {relay_name: {state, mode}} for all relays at/before ts_str"""
    cur.execute("""
        SELECT relay_index, state, mode FROM relay_history
        WHERE id IN (
            SELECT MAX(id) FROM relay_history
            WHERE timestamp <= ?
            GROUP BY relay_index
        )
    """, (ts_str,))
    result = {}
    for idx, st, md in cur.fetchall():
        name = _RELAY_IDX_NAME.get(idx)
        if name:
            result[name] = {'state': 'ON' if st else 'OFF', 'mode': md or 'MANUAL'}
    return result

def _n3_dict(row):
    """Convert soil_sensors_node3 row tuple to frontend node3 fields"""
    if not row:
        return {}
    return {
        'node3_s1_hum': row[0], 'node3_s2_hum': row[1],
        'node3_s3_hum': row[2], 'node3_s4_hum': row[3],
        'node3_s1_ph':  row[4], 'node3_s1_n':   row[5],
        'node3_s1_p':   row[6], 'node3_s1_k':   row[7],
    }

def _start_db_auto_trim():
    """Background thread: trim sensor/node3 data older than 30 days, runs daily"""
    def _trim_loop():
        while True:
            try:
                cutoff = (datetime.now(BANGKOK_TZ) - timedelta(days=30)).strftime('%Y-%m-%d %H:%M:%S')
                with sqlite3.connect(DB_NAME) as conn:
                    c = conn.cursor()
                    c.execute("DELETE FROM sensors WHERE timestamp < ?", (cutoff,))
                    c.execute("DELETE FROM soil_sensors_node3 WHERE timestamp < ?", (cutoff,))
                    deleted = conn.total_changes
                    if deleted:
                        logger.info(f"🧹 Auto-trim: removed {deleted} rows older than 30 days")
                    c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except Exception as e:
                logger.error(f"❌ Auto-trim error: {e}")
            time.sleep(86400)  # Run once per day
    threading.Thread(target=_trim_loop, daemon=True).start()
    logger.info("🗓️  DB auto-trim started (keeps last 30 days)")

# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/backup-data', methods=['GET'])
def get_backup_data():
    """Paginated raw sensor + relay data from SQLite"""
    try:
        limit  = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)

        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # Total for pagination
            cur.execute("SELECT COUNT(*) FROM sensors")
            total = cur.fetchone()[0]

            # Paginated sensor rows (newest first) with nearest node3 reading
            cur.execute("""
                SELECT s.timestamp,
                       s.air_temp, s.air_hum,
                       s.soil_1_hum, s.soil_1_ph, s.soil_1_n, s.soil_1_p, s.soil_1_k,
                       s.soil_2_hum, s.env_lux, s.env_co2,
                       n3.soil_1 AS n3_s1, n3.soil_2 AS n3_s2,
                       n3.soil_3 AS n3_s3, n3.soil_4 AS n3_s4,
                       n3.soil_1_ph AS n3_ph, n3.soil_1_n AS n3_n,
                       n3.soil_1_p  AS n3_p,  n3.soil_1_k AS n3_k
                FROM sensors s
                LEFT JOIN soil_sensors_node3 n3
                  ON n3.id = (SELECT id FROM soil_sensors_node3
                              WHERE timestamp <= s.timestamp
                              ORDER BY timestamp DESC LIMIT 1)
                ORDER BY s.id DESC
                LIMIT ? OFFSET ?
            """, (limit, offset))
            s_rows = cur.fetchall()

            sensor_data = []
            for r in s_rows:
                sensor_data.append({
                    'timestamp': r['timestamp'],
                    'type': 'sensor',
                    '_fresh': True,
                    'data': {
                        'temp': r['air_temp'], 'humidity': r['air_hum'],
                        'lux':  r['env_lux'],  'co2': r['env_co2'],
                        'soil_1': r['soil_1_hum'], 'soil_2': r['soil_2_hum'],
                        'soil_1_ph': r['soil_1_ph'], 'soil_1_n': r['soil_1_n'],
                        'soil_1_p':  r['soil_1_p'],  'soil_1_k': r['soil_1_k'],
                        'node3_s1_hum': r['n3_s1'], 'node3_s2_hum': r['n3_s2'],
                        'node3_s3_hum': r['n3_s3'], 'node3_s4_hum': r['n3_s4'],
                        'node3_s1_ph':  r['n3_ph'],  'node3_s1_n': r['n3_n'],
                        'node3_s1_p':   r['n3_p'],   'node3_s1_k': r['n3_k'],
                    }
                })

            # ── Build relay snapshot for every sensor row ──────────────────
            # relay_history only records state CHANGES, so we replay the
            # timeline to get the state at each sensor timestamp.
            relay_data = []
            if s_rows:
                ts_oldest = s_rows[-1]['timestamp']
                ts_newest = s_rows[0]['timestamp']

                # 1. Seed: state of each relay just before the oldest row in page
                cur.execute("""
                    SELECT relay_index, state, mode FROM relay_history
                    WHERE id IN (
                        SELECT MAX(id) FROM relay_history
                        WHERE timestamp <= ?
                        GROUP BY relay_index
                    )
                """, (ts_oldest,))
                snapshot = {}
                for ev in cur.fetchall():
                    name = _RELAY_IDX_NAME.get(ev['relay_index'])
                    if name:
                        snapshot[name] = {'state': 'ON' if ev['state'] else 'OFF',
                                          'mode': ev['mode'] or 'MANUAL'}

                # 2. Get all relay changes within the page window (ascending)
                cur.execute("""
                    SELECT timestamp, relay_index, state, mode FROM relay_history
                    WHERE timestamp BETWEEN ? AND ?
                    ORDER BY timestamp ASC, id ASC
                """, (ts_oldest, ts_newest))
                changes = [(r['timestamp'], r['relay_index'], r['state'], r['mode'])
                           for r in cur.fetchall()]
                change_idx = 0
                n_changes  = len(changes)

                # 3. Walk sensor rows ascending, apply relay changes as we go
                for sr in reversed(s_rows):   # reversed = ascending order
                    while change_idx < n_changes and changes[change_idx][0] <= sr['timestamp']:
                        _, ridx, st, md = changes[change_idx]
                        rname = _RELAY_IDX_NAME.get(ridx)
                        if rname:
                            snapshot[rname] = {'state': 'ON' if st else 'OFF',
                                               'mode': md or 'MANUAL'}
                        change_idx += 1
                    relay_data.append({
                        'timestamp': sr['timestamp'],
                        'type': 'relay',
                        '_fresh': True,
                        'data': dict(snapshot)   # copy of state at this moment
                    })

            all_data = sorted(sensor_data + relay_data,
                              key=lambda x: x['timestamp'], reverse=True)
            return jsonify({'status': 'success', 'data': all_data,
                            'total': total, 'offset': offset, 'limit': limit})

    except Exception as e:
        logger.error(f"❌ backup-data DB error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/backup-data/monthly', methods=['GET'])
def get_monthly_data():
    """Last 4 weeks grouped by week from SQLite"""
    try:
        cutoff = (datetime.now(BANGKOK_TZ) - timedelta(weeks=4)).strftime('%Y-%m-%d %H:%M:%S')
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("""
                SELECT strftime('%Y-W%W', timestamp) AS week,
                       strftime('%Y-%m-%d', MIN(timestamp)) AS week_start,
                       MAX(timestamp) AS rep_ts,
                       AVG(air_temp) AS temp,  AVG(air_hum) AS humidity,
                       AVG(env_lux)  AS lux,   AVG(env_co2) AS co2,
                       AVG(soil_1_hum) AS soil_1, AVG(soil_2_hum) AS soil_2,
                       AVG(soil_1_ph) AS soil_1_ph, AVG(soil_1_n) AS soil_1_n,
                       AVG(soil_1_p)  AS soil_1_p,  AVG(soil_1_k) AS soil_1_k
                FROM sensors
                WHERE timestamp >= ?
                GROUP BY week
                ORDER BY week ASC
            """, (cutoff,))
            s_rows = cur.fetchall()

            data = []
            for r in s_rows:
                cur.execute("""
                    SELECT soil_1, soil_2, soil_3, soil_4,
                           soil_1_ph, soil_1_n, soil_1_p, soil_1_k
                    FROM soil_sensors_node3
                    WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1
                """, (r['rep_ts'],))
                n3 = cur.fetchone()
                data.append({
                    'timestamp': r['week_start'], 'week_key': r['week'],
                    'type': 'sensor', '_fresh': True,
                    'data': {
                        'temp': r['temp'], 'humidity': r['humidity'],
                        'lux':  r['lux'],  'co2': r['co2'],
                        'soil_1': r['soil_1'], 'soil_2': r['soil_2'],
                        'soil_1_ph': r['soil_1_ph'], 'soil_1_n': r['soil_1_n'],
                        'soil_1_p':  r['soil_1_p'],  'soil_1_k': r['soil_1_k'],
                        **_n3_dict(n3)
                    }
                })
                data.append({
                    'timestamp': r['week_start'], 'week_key': r['week'],
                    'type': 'relay', '_fresh': True,
                    'data': _relay_snapshot_at(cur, r['rep_ts'])
                })

            return jsonify({'status': 'success', 'data': data, 'total': len(data)})

    except Exception as e:
        logger.error(f"❌ monthly DB error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/backup-data/weekly', methods=['GET'])
def get_weekly_data():
    """Last 7 days grouped by day from SQLite"""
    try:
        cutoff = (datetime.now(BANGKOK_TZ) - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("""
                SELECT strftime('%Y-%m-%d', timestamp) AS day,
                       MAX(timestamp) AS rep_ts,
                       AVG(air_temp) AS temp,  AVG(air_hum) AS humidity,
                       AVG(env_lux)  AS lux,   AVG(env_co2) AS co2,
                       AVG(soil_1_hum) AS soil_1, AVG(soil_2_hum) AS soil_2,
                       AVG(soil_1_ph) AS soil_1_ph, AVG(soil_1_n) AS soil_1_n,
                       AVG(soil_1_p)  AS soil_1_p,  AVG(soil_1_k) AS soil_1_k
                FROM sensors
                WHERE timestamp >= ?
                GROUP BY day
                ORDER BY day ASC
            """, (cutoff,))
            s_rows = cur.fetchall()

            data = []
            for r in s_rows:
                cur.execute("""
                    SELECT soil_1, soil_2, soil_3, soil_4,
                           soil_1_ph, soil_1_n, soil_1_p, soil_1_k
                    FROM soil_sensors_node3
                    WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1
                """, (r['rep_ts'],))
                n3 = cur.fetchone()
                data.append({
                    'timestamp': r['day'],
                    'type': 'sensor', '_fresh': True,
                    'data': {
                        'temp': r['temp'], 'humidity': r['humidity'],
                        'lux':  r['lux'],  'co2': r['co2'],
                        'soil_1': r['soil_1'], 'soil_2': r['soil_2'],
                        'soil_1_ph': r['soil_1_ph'], 'soil_1_n': r['soil_1_n'],
                        'soil_1_p':  r['soil_1_p'],  'soil_1_k': r['soil_1_k'],
                        **_n3_dict(n3)
                    }
                })
                data.append({
                    'timestamp': r['day'],
                    'type': 'relay', '_fresh': True,
                    'data': _relay_snapshot_at(cur, r['rep_ts'])
                })

            return jsonify({'status': 'success', 'data': data, 'total': len(data)})

    except Exception as e:
        logger.error(f"❌ weekly DB error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/backup-data/hourly', methods=['GET'])
def get_hourly_data():
    """Last 24h grouped by hour from SQLite"""
    try:
        cutoff = (datetime.now(BANGKOK_TZ) - timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("""
                SELECT strftime('%Y-%m-%d %H:00', timestamp) AS hour,
                       MAX(timestamp) AS rep_ts,
                       AVG(air_temp) AS temp,  AVG(air_hum) AS humidity,
                       AVG(env_lux)  AS lux,   AVG(env_co2) AS co2,
                       AVG(soil_1_hum) AS soil_1, AVG(soil_2_hum) AS soil_2,
                       AVG(soil_1_ph) AS soil_1_ph, AVG(soil_1_n) AS soil_1_n,
                       AVG(soil_1_p)  AS soil_1_p,  AVG(soil_1_k) AS soil_1_k
                FROM sensors
                WHERE timestamp >= ?
                GROUP BY hour
                ORDER BY hour ASC
            """, (cutoff,))
            s_rows = cur.fetchall()

            data = []
            for r in s_rows:
                cur.execute("""
                    SELECT soil_1, soil_2, soil_3, soil_4,
                           soil_1_ph, soil_1_n, soil_1_p, soil_1_k
                    FROM soil_sensors_node3
                    WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1
                """, (r['rep_ts'],))
                n3 = cur.fetchone()
                data.append({
                    'timestamp': r['hour'],
                    'type': 'sensor', '_fresh': True,
                    'data': {
                        'temp': r['temp'], 'humidity': r['humidity'],
                        'lux':  r['lux'],  'co2': r['co2'],
                        'soil_1': r['soil_1'], 'soil_2': r['soil_2'],
                        'soil_1_ph': r['soil_1_ph'], 'soil_1_n': r['soil_1_n'],
                        'soil_1_p':  r['soil_1_p'],  'soil_1_k': r['soil_1_k'],
                        **_n3_dict(n3)
                    }
                })
                data.append({
                    'timestamp': r['hour'],
                    'type': 'relay', '_fresh': True,
                    'data': _relay_snapshot_at(cur, r['rep_ts'])
                })

            return jsonify({'status': 'success', 'data': data, 'total': len(data)})

    except Exception as e:
        logger.error(f"❌ hourly DB error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/test-sensor', methods=['POST'])
def test_sensor():
    """Test AUTO mode by simulating sensor data"""
    try:
        data = request.json or {}
        # Simulate sensor payload
        test_payload = {
            "air": {"temp": data.get('temp', 25.0), "hum": data.get('hum', 60.0)},
            "soil_1": {"hum": data.get('soil_hum', 45.0), "ph": 6.5, "n": 10, "p": 5, "k": 8},
            "soil_2": {"hum": data.get('soil_hum', 45.0)},
            "env": {"lux": data.get('lux', 500.0), "co2": data.get('co2', 400.0)}
        }
        
        # Process through evaluate_auto_mode
        threading.Thread(target=evaluate_auto_mode, args=(test_payload,), daemon=True).start()
        
        logger.info(f"🧪 Test Sensor Data: {test_payload}")
        return jsonify({"status": "success", "message": "Test sensor data sent", "data": test_payload})
    except Exception as e:
        logger.error(f"❌ Test Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info(f"🚀 Smart Farm Backend Starting from: {__file__}")
    logger.info("=" * 60)
    
    # ⭐⭐⭐ CRITICAL: Reset all relay states to ensure robustness ⭐⭐⭐
    reset_all_relay_states()
    
    # 1. Initialize database
    init_db()
    
    # 2. Load relay modes from database (restores user's AUTO/MANUAL preferences)
    load_relay_modes()
    
    # 3. Load relay configs from database (critical for persistence)
    load_relay_configs_from_db()
    
    # 4. Load last state from database (critical for persistence)
    load_last_state()
    
    # 4. Start MQTT client
    start_mqtt_client()
    time.sleep(2)  # Give MQTT time to connect
    
    # 5. Start continuous mock sensor publisher
    CONTINUOUS_MOCK_ENABLED = True
    mock_publisher_thread = threading.Thread(target=continuous_mock_sensor_publisher, daemon=True)
    mock_publisher_thread.start()
    logger.info("🤖 Continuous mock sensor publisher started (until Node1 connects)")

    # 6. Start DB auto-trim (keeps last 30 days, runs daily)
    _start_db_auto_trim()

    # 7. Run Flask-SocketIO server
    logger.info(f"🌐 Server starting on {SERVER_IP}:{SERVER_PORT}...")
    socketio.run(
        app,
        host='0.0.0.0',
        port=SERVER_PORT,
        debug=False,
        use_reloader=False,
        log_output=True,
        allow_unsafe_werkzeug=True  # Allow Werkzeug in production mode for this embedded application
    )