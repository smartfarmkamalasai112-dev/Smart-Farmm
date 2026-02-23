"""
🔍 Sensor Data Watchdog System
Monitors ESP32 sensor data freshness and detects disconnections
"""

import time
import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

class SensorWatchdog:
    """Monitor sensor data freshness and detect ESP32 disconnections"""
    
    def __init__(self, timeout_seconds: int = 30):
        """
        Initialize sensor watchdog
        
        Args:
            timeout_seconds: Time (in seconds) after which sensor data is considered stale
                           Default: 30 seconds
        """
        self.timeout_seconds = timeout_seconds
        self.last_update_time = None
        self.is_data_fresh = False
        self.data_staleness_time = 0
        
    def update_sensor_data(self):
        """
        Call this whenever new sensor data is received from ESP32
        Updates the timestamp of last received data
        """
        self.last_update_time = time.time()
        self.is_data_fresh = True
        self.data_staleness_time = 0
        logger.info(f"✅ Sensor data received from ESP32 - FRESH")
    
    def check_sensor_status(self) -> Tuple[bool, Dict]:
        """
        Check if sensor data is fresh or stale
        
        Returns:
            Tuple of (is_fresh, status_dict)
            - is_fresh (bool): True if data is recent, False if stale
            - status_dict (dict): Status information including:
                * 'is_fresh': Data freshness status
                * 'last_update_time': Unix timestamp of last update
                * 'seconds_since_update': Time elapsed since last update
                * 'timeout_seconds': Timeout threshold
                * 'esp32_connected': Whether ESP32 is considered connected
        """
        if self.last_update_time is None:
            # No data received yet
            return False, {
                'is_fresh': False,
                'last_update_time': None,
                'seconds_since_update': None,
                'timeout_seconds': self.timeout_seconds,
                'esp32_connected': False,
                'reason': 'No sensor data received yet from ESP32'
            }
        
        current_time = time.time()
        seconds_since_update = current_time - self.last_update_time
        self.data_staleness_time = seconds_since_update
        
        is_fresh = seconds_since_update < self.timeout_seconds
        self.is_data_fresh = is_fresh
        
        if is_fresh:
            status = '✅ FRESH'
        else:
            status = '⚠️ STALE'
        
        return is_fresh, {
            'is_fresh': is_fresh,
            'last_update_time': self.last_update_time,
            'seconds_since_update': seconds_since_update,
            'timeout_seconds': self.timeout_seconds,
            'esp32_connected': is_fresh,
            'reason': f'Sensor data is {status} ({seconds_since_update:.1f}s since last update)'
        }
    
    def mark_sensor_stale(self, reason: str = ""):
        """
        Manually mark sensor data as stale (e.g., when ESP32 explicitly disconnects)
        
        Args:
            reason: Optional reason for marking as stale
        """
        self.is_data_fresh = False
        logger.warning(f"⚠️ Sensor data marked as STALE. Reason: {reason}")
    
    def reset(self):
        """Reset the watchdog (clears timestamp)"""
        self.last_update_time = None
        self.is_data_fresh = False
        self.data_staleness_time = 0
        logger.info("🔄 Sensor watchdog reset")
    
    def get_status_message(self) -> str:
        """
        Get a human-readable status message
        
        Returns:
            String describing current sensor status
        """
        _, status = self.check_sensor_status()
        
        if status['esp32_connected']:
            return f"🔌 ESP32 CONNECTED ✅ ({status['seconds_since_update']:.1f}s ago)"
        else:
            if status['seconds_since_update'] is None:
                return "🔴 ESP32 DISCONNECTED (No data received)"
            else:
                return f"🔴 ESP32 DISCONNECTED ⚠️ ({status['seconds_since_update']:.1f}s ago)"
