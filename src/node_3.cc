#include <Arduino.h>
#include <ModbusMaster.h>
#include <SoftwareSerial.h>

// Sensor 1 (Hardware Serial 2) -- now using previous S4 pins
#define S1_RX 21
#define S1_TX 22
#define S1_CTRL 23

// Sensor 2 (Software Serial)
#define S2_RX 32
#define S2_TX 33
#define S2_CTRL 5

// Sensor 3 (Software Serial)
#define S3_RX 25
#define S3_TX 26
#define S3_CTRL 27

// Sensor 4 (Software Serial) -- moved to previous S1 pins
#define S4_RX 16
#define S4_TX 17
#define S4_CTRL 4

ModbusMaster node1, node2, node3, node4;
SoftwareSerial swSer2(S2_RX, S2_TX);
SoftwareSerial swSer3(S3_RX, S3_TX);
SoftwareSerial swSer4(S4_RX, S4_TX);

// Callback Functions สำหรับควบคุมขา DE+RE
void pre1() { digitalWrite(S1_CTRL, HIGH); }  void post1() { delayMicroseconds(500); digitalWrite(S1_CTRL, LOW); }
void pre2() { digitalWrite(S2_CTRL, HIGH); }  void post2() { delayMicroseconds(500); digitalWrite(S2_CTRL, LOW); }
void pre3() { digitalWrite(S3_CTRL, HIGH); }  void post3() { delayMicroseconds(500); digitalWrite(S3_CTRL, LOW); }
void pre4() { digitalWrite(S4_CTRL, HIGH); }  void post4() { delayMicroseconds(500); digitalWrite(S4_CTRL, LOW); }

void setup() {
  Serial.begin(115200);
  
  pinMode(S1_CTRL, OUTPUT); pinMode(S2_CTRL, OUTPUT);
  pinMode(S3_CTRL, OUTPUT); pinMode(S4_CTRL, OUTPUT);

  // เริ่มต้น Hardware Serial 2 (S1)
  Serial2.begin(4800, SERIAL_8N1, S1_RX, S1_TX);
  node1.begin(1, Serial2); node1.preTransmission(pre1); node1.postTransmission(post1);

  // เริ่มต้น Software Serial (S2, S3, S4)
  swSer2.begin(4800);
  node2.begin(1, swSer2); node2.preTransmission(pre2); node2.postTransmission(post2);

  swSer3.begin(4800);
  node3.begin(1, swSer3); node3.preTransmission(pre3); node3.postTransmission(post3);

  swSer4.begin(4800);
  node4.begin(1, swSer4); node4.preTransmission(pre4); node4.postTransmission(post4);

  Serial.println("System Ready: swapped S4 <-> S1 (S1 now on 21,22,23)");
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
  // อ่าน S1 (Hardware)
  node1.clearResponseBuffer();
  uint8_t res1 = node1.readHoldingRegisters(0x0000, 1);
  if (res1 == node1.ku8MBSuccess) {
    Serial.print("S1: "); Serial.print(node1.getResponseBuffer(0) / 10.0); Serial.println(" %");
  } else {
    Serial.print("S1 Error: "); Serial.println(res1, HEX);
  }
  delay(500);

  // อ่าน S2, S3, S4 (Software)
  readSwSensor(node2, swSer2, "S2"); delay(500);
  readSwSensor(node3, swSer3, "S3"); delay(500);
  readSwSensor(node4, swSer4, "S4"); delay(500);

  Serial.println("-----------------------");
  delay(2000);
}