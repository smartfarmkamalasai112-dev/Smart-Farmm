import re

with open('app.py', 'r') as f:
    content = f.read()

old_code = """def save_soil_sensor_data(data):
    \"\"\"Save soil sensor data from Node 3 to SQLite database\"\"\"
    try:
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO soil_sensors_node3 
                         (timestamp, soil_1, soil_2, soil_3, soil_4) 
                         VALUES (?, ?, ?, ?, ?)''',
                      (
                          get_current_timestamp(),
                          data.get('soil_1', 0.0),
                          data.get('soil_2', 0.0),
                          data.get('soil_3', 0.0),
                          data.get('soil_4', 0.0)
                      ))
            conn.commit()
            logger.debug(f"🌱 Soil sensor data saved to database: {data}")
    except Exception as e:
        logger.error(f"❌ Soil Sensor DB Save Error: {e}")"""

new_code = """def save_soil_sensor_data(data):
    \"\"\"Save soil sensor data from Node 3 to SQLite database\"\"\"
    try:
        def get_hum(val):
            if isinstance(val, dict):
                return float(val.get('hum', 0.0))
            return float(val) if val is not None else 0.0
            
        with sqlite3.connect(DB_NAME) as conn:
            c = conn.cursor()
            c.execute('''INSERT INTO soil_sensors_node3 
                         (timestamp, soil_1, soil_2, soil_3, soil_4) 
                         VALUES (?, ?, ?, ?, ?)''',
                      (
                          get_current_timestamp(),
                          get_hum(data.get('soil_1', 0.0)),
                          get_hum(data.get('soil_2', 0.0)),
                          get_hum(data.get('soil_3', 0.0)),
                          get_hum(data.get('soil_4', 0.0))
                      ))
            conn.commit()
            logger.debug(f"🌱 Soil sensor data saved to database: {data}")
    except Exception as e:
        logger.error(f"❌ Soil Sensor DB Save Error: {e}")"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('app.py', 'w') as f:
        f.write(content)
    print("Successfully patched save_soil_sensor_data")
else:
    print("Could not find old_code in app.py")
