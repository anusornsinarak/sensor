// copy of Tab 2 logic
#include <Arduino.h>

void setup() {
  float temp = 25.5;
  float humi = 60.0;
  bool isSensorError = false;
  String json = "{";
  json += "\"temperature\":" + String(temp, 1) + ",";
  json += "\"humidity\":" + String(humi, 1) + ",";
  json += "\"sensor_error\":" + String(isSensorError ? "true" : "false");
  json += "}";
}
void loop() {}
