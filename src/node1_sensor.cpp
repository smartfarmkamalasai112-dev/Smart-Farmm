#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <BH1750.h>
#include <MHZ19.h>
#include <ModbusMaster.h>
#include <SoftwareSerial.h>

// =========================================
// 1. WiFi & MQTT Config
// =========================================
const char* ssid = "Biossmartfarm";
const char* password = "A2pesB3ny";
const char* mqtt_server = "192.168.1.106";  // Original MQTT broker address
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

// =========================================
// 2. Sensor Definitions
// =========================================
// --- Module 1: Air Sensor (XY-MD02) ---
#define RX_AIR        16
#define TX_AIR        17
#define DE_AIR        4  
#define ID_AIR        1
#define BAUD_AIR      9600

// --- Module 2: Soil Sensor (SN-3002) ---
#define RX_SOIL       26 
#define TX_SOIL       27 
#define DE_SOIL       14 
#define ID_SOIL       1      
#define BAUD_SOIL     4800   

// --- Module 3: Soil Moisture 1 (SN-300SD) ---
#define RO_SOIL1      34     // Input-only pin (safe)
#define DI_SOIL1      18     
#define DE_SOIL1      19     
#define ID_SOIL1      1      
#define BAUD_SOIL1    4800   

// --- Module 5: CO2 (MH-Z19b) ---
#define RX_CO2        32
#define TX_CO2        33

// =========================================
// 3. GPIO Relay Definitions
// =========================================
#define RELAY_0  5    // Pump
#define RELAY_1  12   // Fan
#define RELAY_2  25   // Lamp
#define RELAY_3  26   // Mist

// Register Map for Soil (SN-3002)
#define REG_SOIL_HUM  0x0000

// =========================================
// 4. Object Initialization
// =========================================
ModbusMaster nodeAir;
ModbusMaster nodeSoil;
ModbusMaster nodeSoil1;
BH1750 lightMeter;
MHZ19 myMHZ19;

SoftwareSerial co2Serial(RX_CO2, TX_CO2); 
SoftwareSerial soil1Serial(RO_SOIL1, DI_SOIL1);

struct SensorData {
  float air_temp;
  float air_hum;
  float soil_temp;
  float soil_hum;
  uint16_t soil_ec;
  float soil_ph;
  uint16_t soil_n;
  uint16_t soil_p;
  uint16_t soil_k;
  float soil_moisture_1;
  int co2;
  float lux;
} data;

// Relay state tracking
bool relay_state[4] = {false, false, false, false};
unsigned long lastMsg = 0;

// =========================================
// 5. Callbacks for RS485
// =========================================
void preTxAir() { digitalWrite(DE_AIR, HIGH); }
void postTxAir() { digitalWrite(DE_AIR, LOW); }

void preTxSoil() { digitalWrite(DE_SOIL, HIGH); }
void postTxSoil() { digitalWrite(DE_SOIL, LOW); }

void preTxSoil1() { digitalWrite(DE_SOIL1, HIGH); }
void postTxSoil1() { digitalWrite(DE_SOIL1, LOW); }

// =========================================
// 6. MQTT Callback - Handle incoming messages
// =========================================
void mqtt_callback(char* topic, byte* payload, unsigned int length) {
  Serial.println();
  Serial.print("📡 MQTT Message received on topic: ");
  Serial.println(topic);
  
  // Parse payload as JSON
  char message[256] = {0};
  if (length < sizeof(message)) {
    memcpy(message, payload, length);
    message[length] = '\0';
  }
  
  Serial.print("   Payload: ");
  Serial.println(message);
  
  // Handle control messages: {"type": "RELAY", "index": 0, "value": true/false}
  if (strcmp(topic, "smartfarm/control") == 0) {
    // Simple JSON parsing (looking for "index" and "value" fields)
    int relay_index = -1;
    bool relay_value = false;
    
    // Extract index: "index": N
    char* idx_pos = strstr(message, "\"index\"");
    if (idx_pos) {
      sscanf(idx_pos, "\"index\":%d", &relay_index);
    }
    
    // Extract value: "value": true/false
    char* val_pos = strstr(message, "\"value\"");
    if (val_pos) {
      relay_value = (strstr(val_pos, "true") != NULL);
    }
    
    // Validate index
    if (relay_index >= 0 && relay_index <= 3) {
      // Get the correct relay pin
      int relay_pin = RELAY_0;
      switch(relay_index) {
        case 0: relay_pin = RELAY_0; break;
        case 1: relay_pin = RELAY_1; break;
        case 2: relay_pin = RELAY_2; break;
        case 3: relay_pin = RELAY_3; break;
      }
      
      // Control the relay
      digitalWrite(relay_pin, relay_value ? HIGH : LOW);
      relay_state[relay_index] = relay_value;
      
      Serial.print("   ✅ Relay ");
      Serial.print(relay_index);
      Serial.print(" set to ");
      Serial.println(relay_value ? "ON" : "OFF");
    } else {
      Serial.println("   ❌ Invalid relay index");
    }
  }
  // Handle config messages if needed
  else if (strcmp(topic, "smartfarm/config") == 0) {
    Serial.println("   📋 Config message received (not yet implemented)");
  }
}

// =========================================
// 7. WiFi Setup
// =========================================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("🔌 Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 20) {
      Serial.println("\n❌ WiFi connection failed!");
      return;
    }
  }
  
  Serial.println("\n✅ WiFi connected");
  Serial.print("   IP: ");
  Serial.println(WiFi.localIP());
}

// =========================================
// 8. MQTT Reconnection
// =========================================
void reconnect() {
  while (!client.connected()) {
    Serial.print("🔄 Attempting MQTT connection to ");
    Serial.print(mqtt_server);
    Serial.print(":");
    Serial.println(mqtt_port);
    
    if (client.connect("ESP32_SmartFarm_Node1")) {
      Serial.println("✅ MQTT connected!");
      
      // Subscribe to control and config topics
      client.subscribe("smartfarm/control");
      client.subscribe("smartfarm/config");
      Serial.println("   Subscribed to: smartfarm/control, smartfarm/config");
      break;
    } else {
      Serial.print("❌ Failed, rc=");
      Serial.print(client.state());
      Serial.println(" - retrying in 3s");
      delay(3000);
    }
  }
}

// =========================================
// 9. Setup
// =========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n🚀 Smart Farm Node 1 Starting...");
  
  // Initialize relay pins
  pinMode(RELAY_0, OUTPUT);
  pinMode(RELAY_1, OUTPUT);
  pinMode(RELAY_2, OUTPUT);
  pinMode(RELAY_3, OUTPUT);
  digitalWrite(RELAY_0, LOW);
  digitalWrite(RELAY_1, LOW);
  digitalWrite(RELAY_2, LOW);
  digitalWrite(RELAY_3, LOW);
  Serial.println("✅ Relay pins initialized (all OFF)");
  
  // Initialize RS485 control pins
  pinMode(DE_AIR, OUTPUT);
  pinMode(DE_SOIL, OUTPUT);
  pinMode(DE_SOIL1, OUTPUT);
  digitalWrite(DE_AIR, LOW);
  digitalWrite(DE_SOIL, LOW);
  digitalWrite(DE_SOIL1, LOW);

  // Hardware Serial for Air and Soil sensors
  Serial2.begin(BAUD_AIR, SERIAL_8N1, RX_AIR, TX_AIR);
  nodeAir.begin(ID_AIR, Serial2);
  nodeAir.preTransmission(preTxAir);
  nodeAir.postTransmission(postTxAir);

  Serial1.begin(BAUD_SOIL, SERIAL_8N1, RX_SOIL, TX_SOIL);
  nodeSoil.begin(ID_SOIL, Serial1);
  nodeSoil.preTransmission(preTxSoil);
  nodeSoil.postTransmission(postTxSoil);

  // Software Serial for Soil Moisture
  soil1Serial.begin(BAUD_SOIL1);
  nodeSoil1.begin(ID_SOIL1, soil1Serial);
  nodeSoil1.preTransmission(preTxSoil1);
  nodeSoil1.postTransmission(postTxSoil1);

  // CO2 and Light sensors
  co2Serial.begin(9600);
  myMHZ19.begin(co2Serial);
  myMHZ19.autoCalibration(false);

  Wire.begin();
  lightMeter.begin();
  Serial.println("✅ Sensors initialized");

  // WiFi and MQTT setup
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqtt_callback);  // ⭐ CRITICAL: Register MQTT callback
  Serial.println("✅ Setup complete\n");
}

// =========================================
// 10. Main Loop
// =========================================
void loop() {
  // Ensure MQTT connection
  if (!client.connected()) {
    reconnect();
  }
  client.loop();  // Process MQTT messages (calls callback when needed)

  unsigned long now = millis();
  if (now - lastMsg > 5000) {  // Publish every 5 seconds
    lastMsg = now;

    // 1. Air Sensor
    if (nodeAir.readInputRegisters(0x0001, 2) == nodeAir.ku8MBSuccess) {
      data.air_temp = nodeAir.getResponseBuffer(0) / 10.0f;
      data.air_hum = nodeAir.getResponseBuffer(1) / 10.0f;
    }

    // 2. Soil 7-in-1 Sensor
    delay(50);
    if (nodeSoil.readHoldingRegisters(REG_SOIL_HUM, 7) == nodeSoil.ku8MBSuccess) {
      data.soil_hum  = nodeSoil.getResponseBuffer(0) / 10.0f;  // factory default
      data.soil_temp = nodeSoil.getResponseBuffer(1) / 10.0f;
      uint16_t raw_ph1 = nodeSoil.getResponseBuffer(3);
      data.soil_ph   = (raw_ph1 > 0) ? (raw_ph1 / 10.0f) : 0.0f;  // factory default
      data.soil_n    = nodeSoil.getResponseBuffer(4);
      data.soil_p    = nodeSoil.getResponseBuffer(5);
      data.soil_k    = nodeSoil.getResponseBuffer(6);
    }

    // 3. Soil Moisture 1 (SN-300SD)
    soil1Serial.listen();
    delay(150);
    uint8_t resultSoil1 = nodeSoil1.readHoldingRegisters(0x0000, 2);
    if (resultSoil1 == nodeSoil1.ku8MBSuccess) {
      uint16_t val = nodeSoil1.getResponseBuffer(1);
      if (val == 0) val = nodeSoil1.getResponseBuffer(0);
      data.soil_moisture_1 = (val / 10.0f);  // no offset - factory default
    } else {
      data.soil_moisture_1 = 0;
    }

    // 4. Light and CO2
    co2Serial.listen();
    delay(50);
    data.lux = lightMeter.readLightLevel();
    data.co2 = myMHZ19.getCO2();

    // Publish sensor data
    char msg[512];
    snprintf(msg, sizeof(msg), 
      "{\"air\":{\"temp\":%.2f,\"hum\":%.2f},\"soil_1\":{\"hum\":%.2f,\"temp\":%.2f,\"ph\":%.2f,\"n\":%d,\"p\":%d,\"k\":%d},\"soil_2\":{\"hum\":%.2f},\"env\":{\"lux\":%.0f,\"co2\":%d}}",
      data.air_temp, data.air_hum, data.soil_hum, data.soil_temp, data.soil_ph, 
      data.soil_n, data.soil_p, data.soil_k, data.soil_moisture_1, data.lux, data.co2
    );
    
    Serial.println(msg);
    client.publish("smartfarm/sensors", msg);
  }
}
