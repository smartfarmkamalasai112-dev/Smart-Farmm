#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

// =========================================
// 1. Config WiFi & MQTT (แก้ไขส่วนนี้)
// =========================================
const char* ssid = "Biossmartfarm";   // ชื่อเครือข่ายใหม่
const char* password = "A2pesB3ny";   // รหัสผ่านใหม่
const char* mqtt_server = "192.168.1.106"; // IP address ของ Raspberry
const int mqtt_port = 1883;

IPAddress resolve_mqtt_host(const char* host) {
  String h = String(host);
  if (h.endsWith(".local")) h = h.substring(0, h.length() - 6);
  IPAddress ip;
  if (WiFi.hostByName(h.c_str(), ip)) {
    Serial.print("Resolved via DNS: "); Serial.println(ip);
    return ip;
  }
  // try service browse for _mqtt._tcp and match instance name
  int n = MDNS.queryService("_mqtt", "_tcp");
  if (n > 0) {
    for (int i = 0; i < n; i++) {
      String inst = MDNS.hostname(i);
      if (inst == h) {
        ip = MDNS.IP(i);
        if (ip) {
          Serial.print("Resolved via mDNS service: "); Serial.println(ip);
          return ip;
        }
      }
    }
  }
  Serial.println("Could not resolve MQTT host");
  return IPAddress();
}

// =========================================
// 2. Pin Definitions (Node 2)
// =========================================
#define RELAY_1  18 // ปั๊มน้ำ
#define RELAY_2  19 // พัดลม
#define RELAY_3  21 // ไฟ
#define RELAY_4  22 // พ่นหมอก
#define RELAY_5  25 // ปั้มแปลง2 (Plot Pump 2)
#define RELAY_6  26 // ปั้ม Evap (EvapPump)
#define RELAY_7  32 // วาล์ว1 (Valve 1 - Plot 1)
#define RELAY_8  33 // วาล์ว2 (Valve 2 - Plot 1)
#define RELAY_9   4 // วาล์ว3 (Valve 3 - Plot 1)
#define RELAY_10  5 // วาล์ว1 (Valve 1 - Plot 2)
#define RELAY_11 27 // วาล์ว2 (Valve 2 - Plot 2)
#define RELAY_12 14 // วาล์ว3 (Valve 3 - Plot 2)

WiFiClient espClient;
PubSubClient client(espClient);

// =========================================
// 3. Data Structures & Globals
// =========================================

// ⭐ REMOVED: RelayRule struct - NO LOCAL AUTO MODE LOGIC
// ⭐ REMOVED: rules[12] array - ESP32 NO LONGER evaluates sensor conditions
// ⭐ REMOVED: isAutoMode, pumpState, debounce timers - ALL LOCAL LOGIC GONE

// ✅ KEPT: Current relay states (only for status reporting)
bool relayState[12] = {false, false, false, false, false, false, false, false, false, false, false, false};

// ✅ KEPT: Sensor values (for publishing to MQTT, NOT for local decisions)
float currentValues[5] = {0, 0, 0, 0, 0};  // [0]=soil_hum, [1]=temp, [2]=lux, [3]=air_hum, [4]=co2

// Relay names for logging
const char* relayNames[] = {"Pump", "Fan", "Lamp", "Mist", "Plot Pump 2", "EvapPump", 
                           "Valve1 P1", "Valve2 P1", "Valve3 P1", "Valve1 P2", "Valve2 P2", "Valve3 P2"};
// =========================================
// 4. Helper Functions
// =========================================

// ⭐ FIX: Active High relay control (ON=HIGH, OFF=LOW)
// Note: This function is kept for reference but not currently used in callback
void applyRelay(int pin, bool turnOn) {
  // ACTIVE HIGH: HIGH = ON, LOW = OFF
  digitalWrite(pin, turnOn ? HIGH : LOW);
  int pinVal = digitalRead(pin);
  Serial.printf("  >>> GPIO %d output set to %s (reading: %d)\n", pin, turnOn ? "HIGH(ON)" : "LOW(OFF)", pinVal);
}

// ฟังก์ชันส่งสถานะกลับไปหน้าเว็บ (สำคัญมาก เพื่อให้หน้าเว็บตรงกับบอร์ด)
void publishStatus() {
  StaticJsonDocument<512> doc;
  
  JsonArray rStates = doc.createNestedArray("relays");

  // Send all 12 relays states only
  // ⭐ NO CONFIG SENT - Server (Python) is the brain, not ESP32
  for(int i=0; i<12; i++) {
    rStates.add(relayState[i]); // ส่งสถานะ ON/OFF เท่านั้น
  }
  
  char buffer[512];
  serializeJson(doc, buffer);
  client.publish("smartfarm/esp32_status", buffer);
  Serial.printf("[STATUS] Published relay states to smartfarm/esp32_status\n");
}

// =========================================
// 5. MQTT Callback (DUMB ACTUATOR ONLY)
// =========================================
// ⭐ COMPLETELY REFACTORED: No local decision making
// The Python Server on Raspberry Pi is the ONLY brain
// ESP32 ONLY receives commands and publishes sensor data
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  
  Serial.println("\n=== MQTT CALLBACK TRIGGERED ===");
  Serial.printf("[MQTT CALLBACK] Topic: %s\n", topic);
  Serial.printf("[MQTT CALLBACK] Message length: %d bytes\n", length);
  Serial.printf("[MQTT CALLBACK] Raw message: %s\n", msg.c_str());
  
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, msg);
  if (error) {
    Serial.printf("[MQTT ERROR] Failed to parse JSON: %s\n", error.c_str());
    Serial.println("=== END CALLBACK ===\n");
    return;
  }

  String topicStr = String(topic);

  // ===== CASE 1: Receive sensor data from Node 1 (just store it) =====
  if (topicStr == "smartfarm/sensors") {
    currentValues[0] = doc["air"]["hum"] | 0.0;
    currentValues[1] = doc["air"]["temp"] | 0.0;
    currentValues[2] = doc["env"]["lux"] | 0.0;
    currentValues[3] = doc["soil_1"]["hum"] | 0.0;
    currentValues[4] = doc["env"]["co2"] | 0.0;

    Serial.printf("[SENSOR] Stored: Soil=%.1f%% Temp=%.1f°C Lux=%.0f Hum=%.1f%% CO2=%.0fppm\n", 
            currentValues[3], currentValues[1], currentValues[2], currentValues[0], currentValues[4]);
    // ⭐ NO LOCAL EVALUATION - Just store and move on
  }
  
  // ===== CASE 2: Receive relay control commands from Server =====
  // ⭐ THIS IS THE ONLY CONTROL MECHANISM NOW
  else if (topicStr == "smartfarm/control") {
    Serial.printf("[CONTROL] Raw message: %s\n", msg.c_str());
    
    // The server sends: {"relay_0": "ON", "relay_1": "OFF", ...}
    // OR: {"relay_<idx>": true/false}
    
    bool commandExecuted = false;
    
    for(int i = 0; i < 12; i++) {
      // Check both formats: "relay_X" with string and numeric values
      String key = "relay_" + String(i);
      
      bool newState = false;
      bool hasCommand = false;
      
      // Format 1: "relay_0": "ON" / "OFF"
      if (doc.containsKey(key)) {
        if (doc[key].is<const char*>()) {
          String val = doc[key].as<String>();
          val.toUpperCase();
          newState = (val == "ON" || val == "TRUE" || val == "1");
          hasCommand = true;
        }
        // Format 2: "relay_0": true/false
        else if (doc[key].is<bool>()) {
          newState = doc[key].as<bool>();
          hasCommand = true;
        }
      }
      
      // If we got a command for this relay, apply it immediately
      if (hasCommand) {
        relayState[i] = newState;
        
        int pins[] = {RELAY_1, RELAY_2, RELAY_3, RELAY_4, RELAY_5, RELAY_6, 
                      RELAY_7, RELAY_8, RELAY_9, RELAY_10, RELAY_11, RELAY_12};
        
        // ⭐ ACTIVE HIGH HANDLING:
        // Server says "ON" (true) → ESP32 sends HIGH to GPIO (relay activates)
        // Server says "OFF" (false) → ESP32 sends LOW to GPIO (relay deactivates)
        int pinValue = newState ? HIGH : LOW;  // ACTIVE HIGH logic
        digitalWrite(pins[i], pinValue);
        
        int pinRead = digitalRead(pins[i]);
        Serial.printf("[RELAY CMD] Relay %d (%s) -> %s | GPIO %d set to %s (read: %d)\n", 
                      i, relayNames[i], newState ? "ON" : "OFF", 
                      pins[i], pinValue == LOW ? "LOW" : "HIGH", pinRead);
        
        commandExecuted = true;
      }
    }
    
    if (commandExecuted) {
      publishStatus(); // Confirm state change
    } else {
      Serial.println("[CONTROL] ⚠️  No relay commands found in message");
    }
  }
  
  // ⭐ REMOVED: smartfarm/config handling - Server decides all config, not ESP32
  // ⭐ REMOVED: MODE switching - No MODE concept on ESP32, only obey commands
  else {
    Serial.printf("[MQTT] Unknown topic: %s (ignoring)\n", topicStr.c_str());
  }
}

// =========================================
// 6. Setup & Loop
// =========================================
void reconnect() {
  static unsigned long lastReconnectAttempt = 0;
  unsigned long now = millis();
  
  // Only attempt reconnect every 5 seconds
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;
  
  if (!client.connected()) {
    Serial.print("🔄 Attempting MQTT connection to ");
    Serial.print(mqtt_server);
    Serial.print(":");
    Serial.println(mqtt_port);
    Serial.print("   WiFi Status: ");
    Serial.println(WiFi.status());
    
    // Try to connect
    if (client.connect("ESP32_Node2_Relay")) {
      Serial.println("✅ MQTT connected successfully!");
      Serial.println("📡 Subscribing to topics...");
      client.subscribe("smartfarm/sensors");
      client.subscribe("smartfarm/control");
      client.subscribe("smartfarm/config");
      Serial.println("✅ Subscriptions completed");
      publishStatus();
    } else {
      Serial.print("❌ MQTT failed, rc=");
      Serial.print(client.state());
      Serial.print(" - ");
      // Print human-readable error
      int state = client.state();
      switch(state) {
        case -4: Serial.println("MQTT_CONNECTION_TIMEOUT"); break;
        case -3: Serial.println("MQTT_CONNECTION_LOST"); break;
        case -2: Serial.println("MQTT_CONNECT_FAILED"); break;
        case -1: Serial.println("MQTT_DISCONNECTED"); break;
        case 0: Serial.println("MQTT_CONNECTED"); break;
        case 1: Serial.println("MQTT_CONNECT_BAD_PROTOCOL"); break;
        case 2: Serial.println("MQTT_CONNECT_BAD_CLIENT_ID"); break;
        case 3: Serial.println("MQTT_CONNECT_UNAVAILABLE"); break;
        case 4: Serial.println("MQTT_CONNECT_BAD_CREDENTIALS"); break;
        case 5: Serial.println("MQTT_CONNECT_UNAUTHORIZED"); break;
        default: Serial.println("UNKNOWN ERROR");
      }
      Serial.println("   Retrying in 5 seconds...");
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n=== ESP32 Node2 Relay Starting ===");
  
  // ⭐ Setup Pins - 12 relays (ACTIVE HIGH MODE)
  int pins[] = {RELAY_1, RELAY_2, RELAY_3, RELAY_4, RELAY_5, RELAY_6, 
                RELAY_7, RELAY_8, RELAY_9, RELAY_10, RELAY_11, RELAY_12};
  for(int i = 0; i < 12; i++) {
    // ⭐ FIX: Set pinMode FIRST, then set LOW to ensure relay stays OFF during boot
    // ACTIVE HIGH mode: LOW = OFF (relay deactivated), HIGH = ON (relay activated)
    pinMode(pins[i], OUTPUT);
    digitalWrite(pins[i], LOW);  // Set to OFF AFTER pinMode to guarantee it sticks
    delay(50);  // Small delay to ensure GPIO settles
    relayState[i] = false;  // Initialize logical state to OFF
  }
  Serial.printf("GPIO pins configured (12 relays): ");
  for(int i = 0; i < 12; i++) {
    Serial.printf("%d ", pins[i]);
    if(i % 4 == 3) Serial.println("");
  }
  Serial.println("✅ All relays initialized to OFF (LOW - active high mode)");

  // Setup WiFi
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" Connected!");
  // start mDNS responder
  if (!MDNS.begin("esp32-node2")) {
    Serial.println("mDNS init failed");
  } else {
    Serial.println("mDNS responder started");
  }

  IPAddress broker_ip = resolve_mqtt_host(mqtt_server);
  if (broker_ip) {
    client.setServer(broker_ip, mqtt_port);
    Serial.printf("MQTT Server IP: %d.%d.%d.%d:%d\n", broker_ip[0], broker_ip[1], broker_ip[2], broker_ip[3], mqtt_port);
  } else {
    client.setServer(mqtt_server, mqtt_port);
    Serial.printf("MQTT Server hostname: %s:%d\n", mqtt_server, mqtt_port);
  }
  
  // ⭐ CRITICAL: Register the callback function
  client.setCallback(callback);
  Serial.println("✅ MQTT callback registered");
}

unsigned long lastDebug = 0;
static int pins[] = {RELAY_1, RELAY_2, RELAY_3, RELAY_4, RELAY_5, RELAY_6,
                     RELAY_7, RELAY_8, RELAY_9, RELAY_10, RELAY_11, RELAY_12};

void loop() {
  // ⭐ CRITICAL: Call this regularly to maintain MQTT connection and process callbacks
  if (!client.connected()) {
    reconnect();
  }
  client.loop();  // <--- THIS PROCESSES INCOMING MQTT MESSAGES
  
  // Debug: Print MQTT connection state every 10 seconds
  unsigned long now = millis();
  if (now - lastDebug > 10000) {
    lastDebug = now;
    Serial.printf("[LOOP DEBUG] MQTT Connected: %s | Loop running normally\n", 
                  client.connected() ? "YES" : "NO");
  }

  // ⭐ COMPLETELY REMOVED: All AUTO mode evaluation logic
  // ⭐ REMOVED: Pump cycle control, debounce logic, RelayRule evaluation
  // 
  // ESP32 now ONLY:
  // 1. Maintains MQTT connection
  // 2. Listens for commands from Server
  // 3. Applies commands immediately to GPIO pins
  // 4. Reports current state
  // 
  // The Python Server on Raspberry Pi is the ONLY brain that makes decisions

  // Debug ข้อมูลผ่าน Serial Monitor ทุก 3 วินาที
  if (millis() - lastDebug > 3000) {
    lastDebug = millis();
    Serial.println("\n--- ESP32 NODE 2 STATUS (ACTUATOR/SENSOR ONLY) ---");
    Serial.printf("MQTT: %s | Sensors: Soil=%.1f%% Temp=%.1f°C Lux=%.0f Hum=%.1f%% CO2=%.0f\n", 
                  client.connected() ? "CONNECTED" : "DISCONNECTED",
                  currentValues[3], currentValues[1], currentValues[2], currentValues[0], currentValues[4]);
    Serial.println("Relay States:");
    for(int i=0; i<12; i++) {
       const char* state = relayState[i] ? "ON" : "OFF";
       Serial.printf("  [%2d-%s] %s (GPIO %d = %s)\n", i, relayNames[i], state, pins[i], relayState[i] ? "LOW" : "HIGH");
    }
    Serial.println("⭐ All control decisions made by Python Server (Raspberry Pi)");
  }
}