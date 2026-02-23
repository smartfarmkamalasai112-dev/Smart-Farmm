   630	def evaluate_auto_mode(normalized_sensors):
   631	    """
   632	    ⭐ BINARY AUTO MODE WITH STRICT STATE CHECKING ⭐
   633	    
   634	    CRITICAL RULE:
   635	    - ONLY publish MQTT if new_state != current_known_state
   636	    - State source of truth: current_state["status"]["relays"][relay_index]
   637	    - All state reads/writes protected by state_lock
   638	    - NO duplicate MQTT commands ever sent
   639	    """
   640	    global relay_modes, relay_configs, relay_previous_state, current_state, relay_state_change_time
   641	    
   642	    try:
   643	        # Extract raw sensor values (NO SMOOTHING)
   644	        soil_1_hum = float(normalized_sensors.get('soil_1', {}).get('hum', 0) or 0)
   645	        soil_2_hum = float(normalized_sensors.get('soil_2', {}).get('hum', 0) or 0)
   646	        soil_hum = (soil_1_hum + soil_2_hum) / 2.0 if (soil_1_hum and soil_2_hum) else soil_1_hum
        
        # ⭐ NEW: External Soil Sensors (S1-S4)
        s1_hum = 0.0; s2_hum = 0.0; s3_hum = 0.0; s4_hum = 0.0
        with state_lock:
             soil_sensors_data = current_state.get('soil_sensors', {})
             s1_hum = float(soil_sensors_data.get('soil_1', {}).get('hum', 0) or 0)
             s2_hum = float(soil_sensors_data.get('soil_2', {}).get('hum', 0) or 0)
             s3_hum = float(soil_sensors_data.get('soil_3', {}).get('hum', 0) or 0)
             s4_hum = float(soil_sensors_data.get('soil_4', {}).get('hum', 0) or 0)

   647	        
   648	        air_temp = float(normalized_sensors.get('air', {}).get('temp', 0) or 0)
   649	        air_hum = float(normalized_sensors.get('air', {}).get('hum', 0) or 0)
   650	        lux = float(normalized_sensors.get('env', {}).get('lux', 0) or 0)
   651	        co2 = float(normalized_sensors.get('env', {}).get('co2', 0) or 0)
   652	        
   653	        # ⭐ SIMPLE OUTLIER REJECTION: If sensor jumps too much, use previous value
   654	        # This prevents sensor noise/errors from causing oscillation
   655	        # Store last known values (using class variable as cache)
   656	        if not hasattr(evaluate_auto_mode, 'last_sensors'):
   657	            evaluate_auto_mode.last_sensors = {
   658	                'soil_hum': soil_hum, 'air_temp': air_temp, 'air_hum': air_hum, 'lux': lux, 'co2': co2
   659	            }
   660	        
   661	        # Max allowed jump per reading (tuned for our sensors)
   662	        MAX_JUMP = {'soil_hum': 20.0, 'air_temp': 5.0, 'air_hum': 10.0, 'lux': 200.0, 'co2': 150.0}
   663	        
   664	        # Check for outliers and use previous value if jump is too large
   665	        if abs(soil_hum - evaluate_auto_mode.last_sensors['soil_hum']) > MAX_JUMP['soil_hum']:
   666	            soil_hum = evaluate_auto_mode.last_sensors['soil_hum']
   667	            logger.debug(f"⚠️ soil_hum outlier rejected, using last value {soil_hum:.1f}%")
   668	        
   669	        if abs(lux - evaluate_auto_mode.last_sensors['lux']) > MAX_JUMP['lux']:
   670	            lux = evaluate_auto_mode.last_sensors['lux']
   671	            logger.debug(f"⚠️ lux outlier rejected, using last value {lux:.0f}")
   672	        
   673	        if abs(air_hum - evaluate_auto_mode.last_sensors['air_hum']) > MAX_JUMP['air_hum']:
   674	            air_hum = evaluate_auto_mode.last_sensors['air_hum']
   675	            logger.debug(f"⚠️ air_hum outlier rejected, using last value {air_hum:.1f}%")
   676	        
   677	        # Update cache for next comparison
   678	        evaluate_auto_mode.last_sensors = {
   679	            'soil_hum': soil_hum, 'air_temp': air_temp, 'air_hum': air_hum, 'lux': lux, 'co2': co2
   680	        }
   681	        
   682	        relay_names = ['Pump 🌊', 'Fan 🌬️', 'Lamp 💡', 'Mist 💨', 'Plot Pump 2 💨', 'EvapPump 🔄', 'Valve1 P1 🚰', 'Valve2 P1 🚰', 'Valve3 P1 🚰', 'Valve1 P2 🚰', 'Valve2 P2 🚰', 'Valve3 P2 🚰']
   683	        
   684	        logger.info(f"🔍 AUTO Evaluation Start (FILTERED sensors: soil={soil_hum:.1f}%, temp={air_temp:.1f}°C, hum={air_hum:.1f}%, lux={lux:.0f}lux)")
   685	        
   686	        # BINARY LOGIC FOR ALL 12 RELAYS
   687	        for relay_index in range(12):
   688	            # ⭐ ATOMIC READ: Get mode and current state together
   689	            with state_lock:
   690	                mode = relay_modes.get(relay_index, 'MANUAL')
   691	                current_relay_state = current_state["status"]["relays"][relay_index]  # Source of truth
   692	            
   693	            if mode != 'AUTO':
   694	                continue
   695	            
   696	            if relay_index not in relay_configs or not relay_configs[relay_index]:
   697	                logger.warning(f"❌ Relay {relay_index}: Config missing")
   698	                continue
   699	            
   700	            config = relay_configs[relay_index]
   701	            should_turn_on = False
   702	            
   703	            # DUAL SENSOR RELAY (Fan, Valve1 pair, etc.)
   704	            if 'target1' in config:
   705	                target1 = float(config.get('target1', 0))
   706	                condition1 = str(config.get('condition1', '<')).strip()
   707	                param1 = str(config.get('param1', 'temp')).strip()
   708	                
   709	                target2 = float(config.get('target2', 0))
   710	                condition2 = str(config.get('condition2', '<')).strip()
   711	                param2 = str(config.get('param2', 'hum')).strip()
   712	                
   713	                # Get sensor values
   714	                sensor_value1 = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp, 'hum': air_hum, 'lux': lux, 'co2': co2}.get(param1, 0.0)
   715	                sensor_value2 = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp, 'hum': air_hum, 'lux': lux, 'co2': co2}.get(param2, 0.0)
   716	                
   717	                # ⭐ DUAL SENSOR WITH ABSOLUTE MARGINS (hysteresis protection)
   718	                margin1 = get_sensor_margin(param1)
   719	                margin2 = get_sensor_margin(param2)
   720	                
   721	                # Evaluate condition1 with margin
   722	                if condition1 == '>':
   723	                    if sensor_value1 > target1:
   724	                        cond1 = True
   725	                    elif sensor_value1 < (target1 - margin1):
   726	                        cond1 = False
   727	                    else:
   728	                        cond1 = current_relay_state  # In hysteresis zone
   729	                else:  # '<'
   730	                    if sensor_value1 < target1:
   731	                        cond1 = True
   732	                    elif sensor_value1 > (target1 + margin1):
   733	                        cond1 = False
   734	                    else:
   735	                        cond1 = current_relay_state  # In hysteresis zone
   736	                
   737	                # Evaluate condition2 with margin
   738	                if condition2 == '>':
   739	                    if sensor_value2 > target2:
   740	                        cond2 = True
   741	                    elif sensor_value2 < (target2 - margin2):
   742	                        cond2 = False
   743	                    else:
   744	                        cond2 = current_relay_state  # In hysteresis zone
   745	                else:  # '<'
   746	                    if sensor_value2 < target2:
   747	                        cond2 = True
   748	                    elif sensor_value2 > (target2 + margin2):
   749	                        cond2 = False
   750	                    else:
   751	                        cond2 = current_relay_state  # In hysteresis zone
   752	                
   753	                should_turn_on = cond1 or cond2
   754	                logger.info(f"Relay {relay_index} (DUAL): {sensor_value1} {condition1} {target1}±{margin1}={cond1} | {sensor_value2} {condition2} {target2}±{margin2}={cond2} => {should_turn_on}")
   755	            
   756	            # SINGLE SENSOR RELAY
   757	            else:
   758	                target = float(config.get('target', 0))
   759	                condition = str(config.get('condition', '<')).strip()
   760	                param = str(config.get('param', 'soil_hum')).strip()
   761	                
   762	                sensor_value = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp, 'hum': air_hum, 'lux': lux, 'co2': co2}.get(param, 0.0)
   763	                
   764	                # ⭐ GET SENSOR-SPECIFIC MARGIN (absolute hysteresis)
   765	                margin = get_sensor_margin(param)
   766	                
   767	                # ⭐ ABSOLUTE MARGIN LOGIC: With hysteresis band
   768	                # Prevents oscillation by using deadband zone with margin
   769	                if condition == '>':
   770	                    # For > condition: ON if above target, OFF if below (target - margin)
   771	                    if sensor_value > target:
   772	                        should_turn_on = True
   773	                    elif sensor_value < (target - margin):
   774	                        should_turn_on = False
   775	                    else:
   776	                        # In hysteresis zone: keep current state
   777	                        should_turn_on = current_relay_state
   778	                else:  # '<'
   779	                    # For < condition: ON if below target, OFF if above (target + margin)
   780	                    if sensor_value < target:
   781	                        should_turn_on = True
   782	                    elif sensor_value > (target + margin):
   783	                        should_turn_on = False
   784	                    else:
   785	                        # In hysteresis zone: keep current state
   786	                        should_turn_on = current_relay_state
   787	                
   788	                logger.info(f"Relay {relay_index}: {sensor_value} {condition} {target}±{margin} => {should_turn_on}")
   789	            
   790	            # ⭐⭐⭐ STRICT STATE CHECKING ⭐⭐⭐
   791	            # ONLY publish MQTT if state ACTUALLY CHANGED
   792	            # Compare new state against the KNOWN current state (source of truth)
   793	            if should_turn_on != current_relay_state:
   794	                logger.info(f"STATE CHANGE DETECTED: Relay {relay_index} {current_relay_state} -> {should_turn_on}")
   795	                
   796	                # ⭐ ATOMIC UPDATE: Update state under lock BEFORE publishing
   797	                with state_lock:
   798	                    current_state["status"]["relays"][relay_index] = should_turn_on
   799	                    relay_previous_state[relay_index] = should_turn_on
   800	                    relay_state_change_time[relay_index] = time.time()
   801	                
   802	                # ⭐ PUBLISH MQTT: Now safe to publish because we already updated internal state
   803	                # This ensures if the MQTT fails, we at least have tried
   804	                # ⭐ ADD SOURCE SIGNATURE for debugging (per Gemini recommendation)
   805	                control_msg = {
   806	                    f"relay_{relay_index}": ("ON" if should_turn_on else "OFF"),
   807	                    "source": "AUTO_EVAL",  # <--- Source signature to track origin
   808	                    "timestamp": time.time()
   809	                }
   810	                try:
   811	                    mqtt_result = mqtt_client.publish(MQTT_TOPIC_CONTROL, json.dumps(control_msg), qos=1)
   812	                    if mqtt_result.rc != mqtt.MQTT_ERR_SUCCESS:
   813	                        logger.error(f"⚠️ MQTT publish failed for relay {relay_index}: rc={mqtt_result.rc}")
   814	                    else:
   815	                        status_str = "ON ✅" if should_turn_on else "OFF ❌"
   816	                        logger.info(f"📡 MQTT PUBLISHED: relay_{relay_index}={status_str} (source: AUTO_EVAL)")
   817	                except Exception as mqtt_err:
   818	                    logger.error(f"❌ MQTT publish error for relay {relay_index}: {mqtt_err}")
   819	                
   820	                # ⭐ Emit WebSocket event
