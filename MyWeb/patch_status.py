import re

with open('app.py', 'r') as f:
    content = f.read()

start_idx = content.find('def get_status():')
end_idx = content.find('except Exception as e:', start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find get_status")
    exit(1)

new_func = """def get_status():
    \"\"\"Get current system status including MQTT connection and ESP32 sensor freshness\"\"\"
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
        
    """

new_content = content[:start_idx] + new_func + content[end_idx:]

with open('app.py', 'w') as f:
    f.write(new_content)

print("Successfully patched get_status")
