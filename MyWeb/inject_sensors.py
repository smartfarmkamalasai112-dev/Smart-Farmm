
import os

file_path = "evaluate_auto_mode.py"

with open(file_path, 'r') as f:
    content = f.read()

target = "soil_hum = (soil_1_hum + soil_2_hum) / 2.0 if (soil_1_hum and soil_2_hum) else soil_1_hum"
injection = """
        
        # ⭐ NEW: External Soil Sensors (S1-S4)
        s1_hum = 0.0; s2_hum = 0.0; s3_hum = 0.0; s4_hum = 0.0
        with state_lock:
             soil_sensors_data = current_state.get('soil_sensors', {})
             s1_hum = float(soil_sensors_data.get('soil_1', {}).get('hum', 0) or 0)
             s2_hum = float(soil_sensors_data.get('soil_2', {}).get('hum', 0) or 0)
             s3_hum = float(soil_sensors_data.get('soil_3', {}).get('hum', 0) or 0)
             s4_hum = float(soil_sensors_data.get('soil_4', {}).get('hum', 0) or 0)
"""

if target in content and injection.strip().split('\n')[1] not in content:
    new_content = content.replace(target, target + injection)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("✅ Injected sensor reading logic")
else:
    print("⚠️ Target not found or already injected")


# NOW UPDATE THE SENSOR LOOKUP DICT
target_dict_start = "sensor_value1 = {'soil_hum': soil_hum, 'temp': air_temp"
replacement_dict = "sensor_value1 = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp"

if target_dict_start in content:
    # We need to reload content if we modified it
    with open(file_path, 'r') as f:
        content = f.read()
    
    new_content = content.replace(target_dict_start, replacement_dict)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("✅ Updated sensor_value1 lookup dict")

# Update sensor_value2
target_dict_start_2 = "sensor_value2 = {'soil_hum': soil_hum, 'temp': air_temp"
replacement_dict_2 = "sensor_value2 = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp"

if target_dict_start_2 in content:
    with open(file_path, 'r') as f:
        content = f.read()
    new_content = content.replace(target_dict_start_2, replacement_dict_2)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("✅ Updated sensor_value2 lookup dict")

# Update single sensor value lookup
target_dict_single = "sensor_value = {'soil_hum': soil_hum, 'temp': air_temp"
replacement_dict_single = "sensor_value = {'soil_hum': soil_hum, 'soil_2_hum': soil_2_hum, 's1_hum': s1_hum, 's2_hum': s2_hum, 's3_hum': s3_hum, 's4_hum': s4_hum, 'temp': air_temp"

if target_dict_single in content:
    with open(file_path, 'r') as f:
        content = f.read()
    new_content = content.replace(target_dict_single, replacement_dict_single)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("✅ Updated single sensor lookup dict")
