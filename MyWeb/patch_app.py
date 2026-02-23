import re

with open('app.py', 'r') as f:
    content = f.read()

# Find the start and end of evaluate_auto_mode
start_idx = content.find('def evaluate_auto_mode(normalized_sensors):')
end_idx = content.find('except Exception as e:', start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find evaluate_auto_mode")
    exit(1)

new_func = """def evaluate_auto_mode(normalized_sensors):
    \"\"\"
    ⭐ BINARY AUTO MODE WITH STRICT STATE CHECKING ⭐
    
    CRITICAL RULE:
    - ONLY publish MQTT if new_state != current_known_state
    - State source of truth: current_state["status"]["relays"][relay_index]
    - All state reads/writes protected by state_lock
    - NO duplicate MQTT commands ever sent
    \"\"\"
    global relay_modes, relay_configs, relay_previous_state, current_state, relay_state_change_time
    
    try:
        # Extract raw sensor values safely (handle missing data)
        soil_1_hum = normalized_sensors.get('soil_1', {}).get('hum')
        soil_2_hum = normalized_sensors.get('soil_2', {}).get('hum')
        
        if soil_1_hum is not None and soil_2_hum is not None:
            soil_hum = (float(soil_1_hum) + float(soil_2_hum)) / 2.0
        elif soil_1_hum is not None:
            soil_hum = float(soil_1_hum)
        elif soil_2_hum is not None:
            soil_hum = float(soil_2_hum)
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
        
        # ⭐ SIMPLE OUTLIER REJECTION: If sensor jumps too much, use previous value
        # This prevents sensor noise/errors from causing oscillation
        with state_lock:
            if not hasattr(evaluate_auto_mode, 'last_sensors'):
                evaluate_auto_mode.last_sensors = {}
            
            last_sensors = evaluate_auto_mode.last_sensors
            
            # Max allowed jump per reading (tuned for our sensors)
            MAX_JUMP = {'soil_hum': 20.0, 'air_temp': 5.0, 'air_hum': 10.0, 'lux': 200.0, 'co2': 150.0}
            
            # Helper to process sensor value
            def process_sensor(name, current_val):
                if current_val is None or current_val == 0.0:
                    # If missing or exactly 0.0 (likely error), use last known good value if available
                    return last_sensors.get(name)
                
                last_val = last_sensors.get(name)
                if last_val is not None:
                    if abs(current_val - last_val) > MAX_JUMP[name]:
                        logger.debug(f"⚠️ {name} outlier rejected ({current_val} vs {last_val}), using last value")
                        return last_val
                
                # Update cache with valid value
                last_sensors[name] = current_val
                return current_val

            soil_hum = process_sensor('soil_hum', soil_hum)
            air_temp = process_sensor('air_temp', air_temp)
            air_hum = process_sensor('air_hum', air_hum)
            lux = process_sensor('lux', lux)
            co2 = process_sensor('co2', co2)
        
        relay_names = ['Pump 🌊', 'Fan 🌬️', 'Lamp 💡', 'Mist 💨', 'Plot Pump 2 💨', 'EvapPump 🔄', 'Valve1 P1 🚰', 'Valve2 P1 🚰', 'Valve3 P1 🚰', 'Valve1 P2 🚰', 'Valve2 P2 🚰', 'Valve3 P2 🚰']
        
        logger.info(f"🔍 AUTO Evaluation Start (FILTERED sensors: soil={soil_hum if soil_hum is not None else 'N/A'}%, temp={air_temp if air_temp is not None else 'N/A'}°C, hum={air_hum if air_hum is not None else 'N/A'}%, lux={lux if lux is not None else 'N/A'}lux)")
        
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
                
                # Get sensor values
                sensor_dict = {'soil_hum': soil_hum, 'temp': air_temp, 'hum': air_hum, 'lux': lux, 'co2': co2}
                sensor_value1 = sensor_dict.get(param1)
                sensor_value2 = sensor_dict.get(param2)
                
                # Skip evaluation if any required sensor is missing
                if sensor_value1 is None or sensor_value2 is None:
                    logger.warning(f"⚠️ Relay {relay_index} (DUAL): Missing sensor data ({param1}={sensor_value1}, {param2}={sensor_value2}). Skipping evaluation.")
                    continue
                
                # ⭐ DUAL SENSOR WITH ABSOLUTE MARGINS (hysteresis protection)
                margin1 = get_sensor_margin(param1)
                margin2 = get_sensor_margin(param2)
                
                # Evaluate condition1 with margin
                if condition1 == '>':
                    if sensor_value1 > target1:
                        cond1 = True
                    elif sensor_value1 < (target1 - margin1):
                        cond1 = False
                    else:
                        cond1 = current_relay_state  # In hysteresis zone
                else:  # '<'
                    if sensor_value1 < target1:
                        cond1 = True
                    elif sensor_value1 > (target1 + margin1):
                        cond1 = False
                    else:
                        cond1 = current_relay_state  # In hysteresis zone
                
                # Evaluate condition2 with margin
                if condition2 == '>':
                    if sensor_value2 > target2:
                        cond2 = True
                    elif sensor_value2 < (target2 - margin2):
                        cond2 = False
                    else:
                        cond2 = current_relay_state  # In hysteresis zone
                else:  # '<'
                    if sensor_value2 < target2:
                        cond2 = True
                    elif sensor_value2 > (target2 + margin2):
                        cond2 = False
                    else:
                        cond2 = current_relay_state  # In hysteresis zone
                
                should_turn_on = cond1 or cond2
                logger.info(f"Relay {relay_index} (DUAL): {sensor_value1} {condition1} {target1}±{margin1}={cond1} | {sensor_value2} {condition2} {target2}±{margin2}={cond2} => {should_turn_on}")
            
            # SINGLE SENSOR RELAY
            else:
                target = float(config.get('target', 0))
                condition = str(config.get('condition', '<')).strip()
                param = str(config.get('param', 'soil_hum')).strip()
                
                sensor_dict = {'soil_hum': soil_hum, 'temp': air_temp, 'hum': air_hum, 'lux': lux, 'co2': co2}
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
            
            # ⭐⭐⭐ STRICT STATE CHECKING ⭐⭐⭐
            # ONLY publish MQTT if state ACTUALLY CHANGED
            # Compare new state against the KNOWN current state (source of truth)
            if should_turn_on != current_relay_state:
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
                
                # ⭐ Emit WebSocket event
                socketio.emit('relay_update', {
                    'relay_index': relay_index,
                    'state': should_turn_on,
                    'mode': mode,
                    'source': 'AUTO_EVAL'
                }, to=None)
    """

new_content = content[:start_idx] + new_func + content[end_idx:]

with open('app.py', 'w') as f:
    f.write(new_content)

print("Successfully patched app.py")
