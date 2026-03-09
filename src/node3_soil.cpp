#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>
#include <SoftwareSerial.h>

// =========================================
// WiFi & MQTT Config
// =========================================
const char* ssid = "Biossmartfarm";
const char* password = "A2pesB3ny";
const char* mqtt_server = "192.168.1.106";
const int mqtt_port = 1883;
const char* mqtt_topic_soil = "smartfarm/soil_sensors";  // ⭐ Node 3 publishes to this topic

WiFiClient espClient;
PubSubClient mqtt_client(espClient);

// =========================================
// Soil Sensor Modbus Config
// =========================================
// Sensor 1 (Hardware Serial 2)
#define S1_RX 21
#define S1_TX 22
#define S1_CTRL 23

// Sensor 2 (Software Serial)
#define S2_RX 32
#define S2_TX 33
#define S2_CTRL 5

// Sensor 3 (Software Serial)
#define S3_RX 34
#define S3_TX 13
#define S3_CTRL 15

// Sensor 4 (Software Serial)
#define S4_RX 16
#define S4_TX 17
#define S4_CTRL 4

ModbusMaster node1, node2, node3, node4;
SoftwareSerial swSer2(S2_RX, S2_TX);
SoftwareSerial swSer3(S3_RX, S3_TX);
SoftwareSerial swSer4(S4_RX, S4_TX);

// =========================================
// Callback Functions for Modbus
// =========================================
void pre1() { digitalWrite(S1_CTRL, HIGH); }  void post1() { delayMicroseconds(500); digitalWrite(S1_CTRL, LOW); }
void pre2() { digitalWrite(S2_CTRL, HIGH); }  void post2() { delayMicroseconds(500); digitalWrite(S2_CTRL, LOW); }
void pre3() { digitalWrite(S3_CTRL, HIGH); }  void post3() { delayMicroseconds(500); digitalWrite(S3_CTRL, LOW); }
void pre4() { digitalWrite(S4_CTRL, HIGH); }  void post4() { delayMicroseconds(500); digitalWrite(S4_CTRL, LOW); }

// =========================================
// WiFi & MQTT Functions
// =========================================
void setup_wifi() {
  delay(10);
  Serial.println("\n[WiFi] Connecting to: " + String(ssid));
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✅ Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] ❌ Connection failed!");
  }
}

void reconnect_mqtt() {
  while (!mqtt_client.connected()) {
    Serial.print("[MQTT] Connecting to " + String(mqtt_server) + "...");
    
    if (mqtt_client.connect("SmartFarm-Node3-Soil")) {
      Serial.println(" ✅ Connected!");
    } else {
      Serial.print(" ❌ Failed (rc=" + String(mqtt_client.state()) + ")\n");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================");
  Serial.println("  SMART FARM NODE 3 - SOIL SENSORS");
  Serial.println("========================================\n");
  
  // Setup Modbus pins
  pinMode(S1_CTRL, OUTPUT); pinMode(S2_CTRL, OUTPUT);
  pinMode(S3_CTRL, OUTPUT); pinMode(S4_CTRL, OUTPUT);

  // Initialize Hardware Serial 2 (S1)
  Serial2.begin(4800, SERIAL_8N1, S1_RX, S1_TX);
  node1.begin(1, Serial2); node1.preTransmission(pre1); node1.postTransmission(post1);

  // Initialize Software Serial (S2, S3, S4)
  swSer2.begin(4800);
  node2.begin(1, swSer2); node2.preTransmission(pre2); node2.postTransmission(post2);

  swSer3.begin(4800);
  node3.begin(1, swSer3); node3.preTransmission(pre3); node3.postTransmission(post3);

  swSer4.begin(4800);
  node4.begin(1, swSer4); node4.preTransmission(pre4); node4.postTransmission(post4);

  Serial.println("[MODBUS] Initialized - 4 soil sensors ready\n");
  
  // Setup WiFi & MQTT
  setup_wifi();
  mqtt_client.setServer(mqtt_server, mqtt_port);
  
  delay(2000);
  reconnect_mqtt();
}

void readSwSensor(ModbusMaster &node, SoftwareSerial &swSer, String label) {
  swSer.listen();
  delay(150);
  node.clearResponseBuffer();
  uint8_t result = node.readHoldingRegisters(0x0000, 1);
  if (result == node.ku8MBSuccess) {
    Serial.print(label + ": "); 
    Serial.print(node.getResponseBuffer(0) / 10.0); 
    Serial.println(" %");
  } else {
    Serial.print(label + " Error: "); Serial.println(result, HEX);
  }
}

void loop() {
  // ⭐ MQTT Keep-Alive
  if (!mqtt_client.connected()) {
    reconnect_mqtt();
  }
  mqtt_client.loop();
  
  // Read soil sensors
  float soil_1 = 0.0, soil_2 = 0.0, soil_3 = 0.0, soil_4 = 0.0;
  float soil_1_ph = 0.0;
  uint16_t soil_1_n = 0, soil_1_p = 0, soil_1_k = 0;
  bool success = true;
  
  // ⭐ Read S1 (Hardware Serial) - Register layout: moisture(0), temp(1), EC(2), pH(3), N(4), P(5), K(6)
  uint8_t res1 = node1.ku8MBIllegalDataAddress;
  for (int attempt = 0; attempt < 3; attempt++) {
    node1.clearResponseBuffer();
    res1 = node1.readHoldingRegisters(0x0000, 7);  // Read 7 registers: moisture, temp, EC, pH, N, P, K
    if (res1 == node1.ku8MBSuccess) break;
    delay(200);
  }
  if (res1 == node1.ku8MBSuccess) {
    soil_1 = node1.getResponseBuffer(0) / 10.0;  // factory default
    uint16_t raw_ph = node1.getResponseBuffer(3);          // pH at index 3
    soil_1_ph = (raw_ph > 0) ? (raw_ph / 10.0f) : 0.0f;  // factory default
    soil_1_n = node1.getResponseBuffer(4);             // Nitrogen
    soil_1_p = node1.getResponseBuffer(5);             // Phosphorus
    soil_1_k = node1.getResponseBuffer(6);             // Potassium
    Serial.print("[S1] "); Serial.print(soil_1); Serial.print("% | pH:"); Serial.print(soil_1_ph); 
    Serial.print(" | NPK: "); Serial.print(soil_1_n); Serial.print(", "); 
    Serial.print(soil_1_p); Serial.print(", "); Serial.println(soil_1_k);
  } else {
    Serial.print("[S1] Error: "); Serial.println(res1, HEX);
    success = false;
  }
  delay(500);

  // ⭐ Read S2 (Software Serial) - SN-300SD
  swSer2.listen();
  delay(250);
  uint8_t res2 = node2.ku8MBIllegalDataAddress;
  for (int attempt = 0; attempt < 3; attempt++) {
    node2.clearResponseBuffer();
    res2 = node2.readHoldingRegisters(0x0000, 1);
    if (res2 == node2.ku8MBSuccess) break;
    delay(200);
  }
  if (res2 == node2.ku8MBSuccess) {
    soil_2 = node2.getResponseBuffer(0) / 10.0;  // factory default
    Serial.print("[S2] "); Serial.print(soil_2); Serial.println(" %");
  } else {
    Serial.print("[S2] Error: "); Serial.println(res2, HEX);
    soil_2 = 0.0;
  }
  delay(500);

  // ⭐ Read S3 (Software Serial) - SN-300SD (GPIO 34/13/15)
  swSer3.listen();
  delay(250);
  uint8_t res3 = node3.ku8MBIllegalDataAddress;
  for (int attempt = 0; attempt < 3; attempt++) {
    node3.clearResponseBuffer();
    res3 = node3.readHoldingRegisters(0x0000, 1);
    if (res3 == node3.ku8MBSuccess) break;
    delay(200);
  }
  if (res3 == node3.ku8MBSuccess) {
    soil_3 = node3.getResponseBuffer(0) / 10.0;  // factory default
    Serial.print("[S3] "); Serial.print(soil_3); Serial.println(" %");
  } else {
    Serial.print("[S3] Error: "); Serial.println(res3, HEX);
    soil_3 = 0.0;
  }
  delay(500);

  // ⭐ Read S4 (Software Serial) - SN-300SD (GPIO 16/17/4)
  swSer4.listen();
  delay(250);
  uint8_t res4 = node4.ku8MBIllegalDataAddress;
  for (int attempt = 0; attempt < 3; attempt++) {
    node4.clearResponseBuffer();
    res4 = node4.readHoldingRegisters(0x0000, 1);
    if (res4 == node4.ku8MBSuccess) break;
    delay(200);
  }
  if (res4 == node4.ku8MBSuccess) {
    soil_4 = node4.getResponseBuffer(0) / 10.0;  // factory default
    Serial.print("[S4] "); Serial.print(soil_4); Serial.println(" %");
  } else {
    Serial.print("[S4] Error: "); Serial.println(res4, HEX);
    soil_4 = 0.0;
  }
  delay(500);

  // ⭐ PUBLISH TO MQTT (always publish test data)
  if (mqtt_client.connected()) {
    JsonDocument doc;
    
    // Soil Sensor 1 with NPK
    JsonObject soil1_obj = doc["soil_1"].to<JsonObject>();
    soil1_obj["hum"] = soil_1;
    soil1_obj["ph"] = soil_1_ph;
    soil1_obj["n"] = soil_1_n;
    soil1_obj["p"] = soil_1_p;
    soil1_obj["k"] = soil_1_k;
    
    // Soil Sensors 2-4 (simple humidity)
    doc["soil_2"] = soil_2;
    doc["soil_3"] = soil_3;
    doc["soil_4"] = soil_4;
    doc["soil_3"] = soil_3;
    doc["soil_4"] = soil_4;
    
    String payload;
    serializeJson(doc, payload);
    
    if (mqtt_client.publish(mqtt_topic_soil, payload.c_str())) {
      Serial.println("[MQTT] ✅ Published: " + payload);
    } else {
      Serial.println("[MQTT] ❌ Publish failed!");
    }
  } else {
    Serial.println("[MQTT] ⚠️  Not connected, skipping publish...");
  }

  Serial.println("-----------------------------------");
  delay(5000);  // Read sensors every 5 seconds
}
