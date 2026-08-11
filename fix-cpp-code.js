import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/sensor_data?key=${config.apiKey}`;

let cppCode = `
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <SimpleDHT.h>
#include <Wire.h> 
#include <time.h> 
#include "soc/soc.h"          
#include "soc/rtc_cntl_reg.h" 

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "${FIREBASE_URL}";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ (CYD ESP32-2432S028) ---
#define XPT2046_IRQ   36
#define XPT2046_MOSI  32
#define XPT2046_MISO  39
#define XPT2046_CLK   25
#define XPT2046_CS    33
#define TFT_BL        21  

SPIClass touchSpi = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- 3. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
unsigned long lastSend = 0;
unsigned long lastTimeUpdate = 0;
const int sendIntervalSec = 30;
int currentShtAddress = 0;

// --- 4. ฟังก์ชันจัดการเซนเซอร์ (อ่าน DHT11, DHT22, SHT30) ---
void scanAndReadSensor() {
  isSensorError = true;
  float t = 0, h = 0;

  // 4.1 ลองอ่าน SHT30 (I2C)
  if (currentShtAddress == 0) {
    Wire.begin(27, 22);
    Wire.beginTransmission(0x44);
    if (Wire.endTransmission() == 0) currentShtAddress = 0x44;
    else {
      Wire.beginTransmission(0x45);
      if (Wire.endTransmission() == 0) currentShtAddress = 0x45;
    }
  }
  
  if (currentShtAddress != 0) {
    Wire.beginTransmission(currentShtAddress);
    Wire.write(0x2C); Wire.write(0x06);
    if (Wire.endTransmission() == 0) {
      delay(20);
      Wire.requestFrom(currentShtAddress, 6);
      if (Wire.available() == 6) {
        uint8_t data[6];
        for (int i = 0; i < 6; i++) data[i] = Wire.read();
        t = ((((data[0] * 256.0) + data[1]) * 175) / 65535.0) - 45;
        h = ((((data[3] * 256.0) + data[4]) * 100) / 65535.0);
        if (!isnan(t) && !isnan(h) && t > -40 && t < 120 && h >= 0 && h <= 100) {
          temp = t; humi = h; isSensorError = false;
          return; 
        }
      }
    }
  }

  // 4.2 ลองอ่าน DHT11/DHT22 แบบ Native High-Precision Bit Reader
  int dhtPins[] = {27, 22, 17};
  for (int p : dhtPins) {
    pinMode(p, INPUT_PULLUP); delay(2);
    pinMode(p, OUTPUT); digitalWrite(p, LOW); delay(20);
    digitalWrite(p, HIGH); delayMicroseconds(40);
    pinMode(p, INPUT_PULLUP);
    
    unsigned long timeout = micros();
    while (digitalRead(p) == HIGH) { if (micros() - timeout > 100) break; }
    timeout = micros();
    while (digitalRead(p) == LOW) { if (micros() - timeout > 100) break; }
    timeout = micros();
    while (digitalRead(p) == HIGH) { if (micros() - timeout > 100) break; }
    
    uint8_t data[5] = {0, 0, 0, 0, 0};
    bool pinValid = true;
    noInterrupts();
    for (int i = 0; i < 40; i++) {
      timeout = micros();
      while (digitalRead(p) == LOW) { if (micros() - timeout > 100) { pinValid = false; break; } }
      unsigned long ts = micros();
      while (digitalRead(p) == HIGH) { if (micros() - ts > 100) { pinValid = false; break; } }
      if ((micros() - ts) > 40) data[i / 8] |= (1 << (7 - (i % 8)));
    }
    interrupts();
    
    if (pinValid && ((data[0] + data[1] + data[2] + data[3]) & 0xFF) == data[4] && data[4] != 0) {
      if (data[1] == 0 && data[3] == 0) { 
        t = data[2]; h = data[0]; 
      } else { 
        t = ((data[2] & 0x7F) << 8 | data[3]) * 0.1;
        if (data[2] & 0x80) t *= -1;
        h = (data[0] << 8 | data[1]) * 0.1;
      }
      if (!isnan(t) && !isnan(h) && t > -40 && t < 120 && h >= 0 && h <= 100) {
        temp = t; humi = h; isSensorError = false;
        return; 
      }
    }
  }
}

// --- 5. การแสดงผลหน้าจอ (UI) ดีไซน์ใหม่ ---
void drawUI() {
  tft.fillScreen(TFT_BLACK);
  
  // Top Bar: Time container
  tft.fillRect(0, 0, 320, 50, tft.color565(20, 30, 50));
  tft.setTextColor(TFT_WHITE, tft.color565(20, 30, 50));
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Loading Time...", 160, 25, 4);

  // Middle labels
  tft.setTextColor(tft.color565(150, 150, 150), TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("TEMPERATURE", 80, 75, 2);
  tft.drawString("HUMIDITY", 240, 75, 2);

  // Line separator
  tft.drawFastVLine(160, 60, 130, tft.color565(40, 40, 40));
  
  // Bottom Bar (Status & Button)
  tft.fillRect(0, 205, 320, 35, tft.color565(15, 15, 15));
  
  // Reset WiFi Button
  tft.fillRoundRect(230, 208, 85, 28, 4, tft.color565(255, 180, 0));
  tft.setTextColor(TFT_BLACK, tft.color565(255, 180, 0));
  tft.setTextDatum(MC_DATUM);
  tft.drawString("WIFI CFG", 272, 222, 2);
}

void drawTime() {
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 50)) {
    char timeStr[30];
    strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
    
    // Clear top bar area for text
    tft.fillRect(0, 0, 320, 50, tft.color565(20, 30, 50)); 
    
    // Check if we also want date
    char dateStr[30];
    strftime(dateStr, sizeof(dateStr), "%d %b %Y", &timeinfo);
    
    tft.setTextColor(TFT_WHITE, tft.color565(20, 30, 50));
    tft.setTextDatum(MC_DATUM);
    tft.drawString(timeStr, 160, 18, 4); // Big Time
    tft.setTextColor(tft.color565(200, 200, 200), tft.color565(20, 30, 50));
    tft.drawString(dateStr, 160, 38, 2); // Small Date
  }
}

void drawStatusCard() {
  // --- Temperature ---
  tft.fillRect(0, 90, 155, 90, TFT_BLACK); 
  tft.setTextDatum(MC_DATUM);
  if (isSensorError) {
    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.drawString("ERR", 80, 130, 6);
  } else {
    tft.setTextColor(tft.color565(255, 95, 45), TFT_BLACK);
    tft.drawString(String(temp, 1), 70, 130, 6); 
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.drawString("C", 135, 120, 4);
  }

  // --- Humidity ---
  tft.fillRect(165, 90, 155, 90, TFT_BLACK);
  if (isSensorError) {
    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.drawString("ERR", 240, 130, 6);
  } else {
    tft.setTextColor(tft.color565(50, 180, 255), TFT_BLACK);
    tft.drawString(String(humi, 1), 230, 130, 6);
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.drawString("%", 295, 120, 4);
  }
  
  // --- Bottom Status Bar (Left side) ---
  tft.fillRect(0, 205, 225, 35, tft.color565(15, 15, 15));
  tft.setTextColor(TFT_LIGHTGREY, tft.color565(15, 15, 15));
  tft.setTextDatum(ML_DATUM);
  
  String ipStr = "IP: " + WiFi.localIP().toString();
  String codeStr = "HTTP: " + String(lastCloudCode);
  tft.drawString(ipStr, 5, 215, 1);
  tft.drawString(codeStr, 5, 228, 1);
}

void checkTouch() {
  if (touch.touched()) {
    TS_Point p = touch.getPoint();
    // Rotation Mapping for Touch (Landscape)
    int touchX = map(p.x, 300, 3800, 0, 320);
    int touchY = map(p.y, 300, 3800, 0, 240);
    
    // Check if touched the WIFI CFG button (230, 208, 85, 28)
    if (touchX > 220 && touchX < 320 && touchY > 195 && touchY < 240) {
      tft.fillScreen(TFT_BLACK);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.setTextDatum(MC_DATUM);
      tft.drawString("Resetting WiFi...", 160, 100, 4);
      tft.drawString("Please wait.", 160, 130, 2);
      delay(1000);
      WiFiManager wm;
      wm.resetSettings();
      ESP.restart();
    }
  }
}

// --- 6. ฟังก์ชัน Setup & Loop ---
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // ปิด Brownout
  Serial.begin(115200);

  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin();
  touch.setRotation(1);

  tft.init();
  tft.setRotation(1);
  
  // Initial Loading Screen
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Connecting WiFi...", 160, 100, 4);
  tft.drawString("Use phone to connect CYD_ESP32_LIGHT", 160, 140, 2);

  // Default WiFi Fallback
  WiFi.mode(WIFI_STA);
  WiFi.begin("Mai_home_2.4G", "0909142651");
  int retry = 0;
  while(WiFi.status() != WL_CONNECTED && retry < 15) {
     delay(500);
     Serial.print(".");
     retry++;
  }

  // Setup WiFi Manager if hardcoded one fails
  if (WiFi.status() != WL_CONNECTED) {
    WiFiManager wm;
    wm.setConfigPortalTimeout(180); 
    if (!wm.startConfigPortal("CYD_ESP32_LIGHT")) {
      Serial.println("Failed to connect or hit timeout");
      delay(3000);
      ESP.restart();
    }
  }

  Serial.println("\\nWiFi Connected!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());

  // Setup Time
  configTime(25200, 0, "asia.pool.ntp.org", "pool.ntp.org", "time.nist.gov");

  drawUI();
}

void loop() {
  checkTouch();

  // Update Time every second
  if (millis() - lastTimeUpdate > 1000) {
    drawTime();
    lastTimeUpdate = millis();
  }

  // Update Sensor Data & Cloud
  if (millis() - lastSend > (sendIntervalSec * 1000) || lastSend == 0) {
    scanAndReadSensor();
    
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client; client.setInsecure();
      HTTPClient http;
      http.setTimeout(8000);
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
      
      if (http.begin(client, serverUrl)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("User-Agent", "ESP32-CYD-SensorFlow");
        
        time_t now; time(&now);
        String json = "{";
        json += "\\"fields\\": {";
        json += "\\"temperature\\": {\\"doubleValue\\": " + String(temp, 1) + "},";
        json += "\\"humidity\\": {\\"doubleValue\\": " + String(humi, 1) + "},";
        json += "\\"sensor_error\\": {\\"booleanValue\\": " + String(isSensorError ? "true" : "false") + "},";
        json += "\\"timestamp\\": {\\"integerValue\\": \\"" + String((unsigned long)now) + "000\\"}";
        json += "}}";

        Serial.println("Sending Data...");
        lastCloudCode = http.POST(json);
        Serial.print("HTTP: "); Serial.println(lastCloudCode);
        http.end();
      }
    }
    
    drawStatusCard();
    lastSend = millis();
  }
}
`;

// Properly escape for standard template literal injection
let escapedCpp = cppCode.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

let tsxCode = fs.readFileSync('src/App.tsx', 'utf8');

// Replace everything between const esp32CodeLight = `...`;
// Non-greedy match until the next backtick and semicolon
tsxCode = tsxCode.replace(/const esp32CodeLight = `[\s\S]*?`;/g, 'const esp32CodeLight = `' + escapedCpp + '`;');
tsxCode = tsxCode.replace(/const esp32CodeJson = `[\s\S]*?`;/g, 'const esp32CodeJson = `' + escapedCpp + '`;');

fs.writeFileSync('src/App.tsx', tsxCode);
console.log("Successfully replaced C++ string literals.");
