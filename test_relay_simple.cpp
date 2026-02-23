// Simple relay test - no WiFi/MQTT, just pin toggling
#include <Arduino.h>

#define RELAY_1  18
#define RELAY_2  19
#define RELAY_3  21
#define RELAY_4  22

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  pinMode(RELAY_1, OUTPUT);
  pinMode(RELAY_2, OUTPUT);
  pinMode(RELAY_3, OUTPUT);
  pinMode(RELAY_4, OUTPUT);
  
  // Start all OFF (HIGH for active-LOW relay module)
  digitalWrite(RELAY_1, HIGH);
  digitalWrite(RELAY_2, HIGH);
  digitalWrite(RELAY_3, HIGH);
  digitalWrite(RELAY_4, HIGH);
  
  Serial.println("\n=== RELAY TEST ===");
  Serial.println("Pin 18 (Relay 1) - Pump");
  Serial.println("Pin 19 (Relay 2) - Fan");
  Serial.println("Pin 21 (Relay 3) - Lamp");
  Serial.println("Pin 22 (Relay 4) - Mist");
  Serial.println("\nToggling each relay...\n");
}

void loop() {
  // Test each relay one at a time
  for(int i = 0; i < 4; i++) {
    int pins[] = {RELAY_1, RELAY_2, RELAY_3, RELAY_4};
    const char* names[] = {"PUMP", "FAN", "LAMP", "MIST"};
    
    // Turn ON
    digitalWrite(pins[i], LOW);  // LOW = ON (active-low)
    Serial.printf("[%s] ON (pin %d = LOW)\n", names[i], pins[i]);
    delay(2000);
    
    // Turn OFF
    digitalWrite(pins[i], HIGH); // HIGH = OFF
    Serial.printf("[%s] OFF (pin %d = HIGH)\n\n", names[i], pins[i]);
    delay(2000);
  }
  
  delay(3000); // Wait 3 seconds before next cycle
}
