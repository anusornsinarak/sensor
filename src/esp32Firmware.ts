export function getEsp32Firmware(settings: {
  maxTemp: number;
  maxHum: number;
  roomType: string;
  weatherLocation?: string;
  weatherLat?: number;
  weatherLon?: number;
}) {
  const roomNameMap: Record<string, string> = {
    GENERAL: 'GENERAL',
    SERVER_ROOM: 'SERVER ROOM',
    MUSHROOM_FARM: 'MUSHROOM FARM',
    BEDROOM: 'BEDROOM',
    GREENHOUSE: 'GREENHOUSE',
    BABY_ROOM: 'BABY ROOM',
    WINE_CELLAR: 'WINE CELLAR',
    PHARMACY: 'PHARMACY',
  };

  const roomLabel = roomNameMap[settings.roomType] || 'GENERAL';
  const cityName = settings.weatherLocation ? settings.weatherLocation.split(' ')[0] : 'Prachinburi';
  const lat = settings.weatherLat || 14.0509;
  const lon = settings.weatherLon || 101.3716;

  return `#include <functional>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <SimpleDHT.h>
#include <Wire.h> 
#include <time.h> 
#include "soc/soc.h" 
#include "soc/rtc_cntl_reg.h" 

// --- 0. ตั้งค่า WiFi บ้านล่วงหน้า (ค่าเริ่มต้น) ---
const char* WIFI_SSID = "Mai_home_2.4G"; 
const char* WIFI_PASSWORD = "0909142651"; 

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0516953163/databases/ai-studio-iotsensordashboa-6c74a260-d381-44d8-ae58-a587051c2d98/documents/sensor_data?key=AIzaSyCXLGKCPAStDBt0RTcCUdX3ew4c_uB6oxs";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ ---
#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33
#define TFT_BL 21 

SPIClass touchSpi = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- 3. จานสีธีม Dark Dashboard ---
#define COLOR_BG tft.color565(18, 22, 28) 
#define COLOR_CARD_LINE tft.color565(42, 50, 64) 
#define COLOR_ORANGE tft.color565(255, 95, 45) 
#define COLOR_CYAN tft.color565(50, 180, 255) 
#define COLOR_MUTED tft.color565(140, 150, 165) 
#define COLOR_BTN_SLEEP tft.color565(30, 60, 105)
#define COLOR_WEATHER_BG tft.color565(15, 28, 48)
#define COLOR_GOOD tft.color565(50, 220, 120)
#define COLOR_WARN tft.color565(255, 190, 40)

// --- 4. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
int sendIntervalSec = 15; 
unsigned long lastSend = 0;
String lastSyncOK = "--:--";
unsigned long lastSensorRead = 0;
unsigned long lastClockUpdate = 0;
unsigned long lastWeatherUpdate = 0;
bool isScreenSleep = false;          // สถานะโหมดพักหน้าจอ
unsigned long lastTouchTime = 0;     // ป้องกันการกดย้ำ (Debounce)

// สภาพอากาศภายนอก (${settings.weatherLocation || 'ปราจีนบุรี'})
float outTemp = 0.0;
float outHumi = 0.0;
String outCity = "${cityName}";
String outCondition = "Connecting...";

// ==========================================
// ส่วนที่ 5: ฟังก์ชันอ่านเซนเซอร์ (คงไว้ตามโค้ดเดิมของคุณ 100%)
// ==========================================
bool readSHT30I2C(uint8_t addr, float &outTemp, float &outHumi) {
  Wire.beginTransmission(addr);
  Wire.write(0x2C);
  Wire.write(0x06);
  if (Wire.endTransmission() != 0) {
    Wire.beginTransmission(addr);
    Wire.write(0x24);
    Wire.write(0x00);
    if (Wire.endTransmission() != 0) return false;
  }
  delay(35);
  if (Wire.requestFrom((uint16_t)addr, (uint8_t)6) == 6) {
    uint8_t data[6];
    for (int i = 0; i < 6; i++) data[i] = Wire.read();
    uint16_t rawTemp = (data[0] << 8) | data[1];
    uint16_t rawHumi = (data[3] << 8) | data[4];
    float t = -45.0 + (175.0 * (float)rawTemp / 65535.0);
    float h = 100.0 * ((float)rawHumi / 65535.0);
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

bool readSHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x40);
  Wire.write(0xF3);
  if (Wire.endTransmission() == 0) {
    delay(50);
    if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
      uint8_t msb = Wire.read();
      uint8_t lsb = Wire.read();
      Wire.read();
      uint16_t rawT = ((uint16_t)msb << 8) | lsb;
      rawT &= ~0x0003;
      float t = -46.85 + (175.72 * (float)rawT / 65536.0);
      
      Wire.beginTransmission(0x40);
      Wire.write(0xF5);
      if (Wire.endTransmission() == 0) {
        delay(30);
        if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
          uint8_t hmsb = Wire.read();
          uint8_t hlsb = Wire.read();
          Wire.read();
          uint16_t rawH = ((uint16_t)hmsb << 8) | hlsb;
          rawH &= ~0x0003;
          float h = -6.0 + (125.0 * (float)rawH / 65536.0);
          if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
            outTemp = t; outHumi = h;
            return true;
          }
        }
      }
    }
  }
  return false;
}

bool readAHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x38);
  Wire.write(0xAC); Wire.write(0x33); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(50);
  if (Wire.requestFrom((uint8_t)0x38, (uint8_t)6) == 6) {
    uint8_t d[6];
    for (int i = 0; i < 6; i++) d[i] = Wire.read();
    uint32_t humRaw = ((uint32_t)d[1] << 12) | ((uint32_t)d[2] << 4) | (d[3] >> 4);
    uint32_t tempRaw = (((uint32_t)d[3] & 0x0F) << 16) | ((uint32_t)d[4] << 8) | d[5];
    float h = ((float)humRaw * 100.0) / 1048576.0;
    float t = (((float)tempRaw * 200.0) / 1048576.0) - 50.0;
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

bool readDHTDirect(int pin, bool isDHT22, float &outTemp, float &outHumi) {
  uint8_t data[5] = {0, 0, 0, 0, 0};
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(isDHT22 ? 2 : 20);
  digitalWrite(pin, HIGH);
  delayMicroseconds(30);
  pinMode(pin, INPUT_PULLUP);

  unsigned long timeout = micros();
  while (digitalRead(pin) == HIGH) {
    if (micros() - timeout > 100) return false;
  }
  timeout = micros();
  while (digitalRead(pin) == LOW) {
    if (micros() - timeout > 100) return false;
  }
  timeout = micros();
  while (digitalRead(pin) == HIGH) {
    if (micros() - timeout > 100) return false;
  }

  noInterrupts();
  for (int i = 0; i < 40; i++) {
    unsigned long t1 = micros();
    while (digitalRead(pin) == LOW) {
      if (micros() - t1 > 100) { interrupts(); return false; }
    }
    unsigned long t2 = micros();
    while (digitalRead(pin) == HIGH) {
      if (micros() - t2 > 100) { interrupts(); return false; }
    }
    if ((micros() - t2) > 40) {
      data[i / 8] |= (1 << (7 - (i % 8)));
    }
  }
  interrupts();
  if (data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xFF)) {
    if (isDHT22) {
      outHumi = (float)((data[0] << 8) | data[1]) * 0.1;
      outTemp = (float)(((data[2] & 0x7F) << 8) | data[3]) * 0.1;
      if (data[2] & 0x80) outTemp = -outTemp;
    } else {
      outHumi = data[0] + (float)data[1] * 0.1;
      outTemp = data[2] + (float)data[3] * 0.1;
    }
    return (outHumi > 0 && outHumi <= 100 && outTemp >= -20 && outTemp <= 125);
  }
  return false;
}

void readSensorAuto() {
  float t = 0, h = 0;
  Wire.end();
  Wire.begin(27, 22);
  Wire.setClock(100000);
  delay(5);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false; return;
  }
  Wire.end();
  Wire.begin(22, 27);
  Wire.setClock(100000);
  delay(5);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false; return;
  }
  Wire.end();
  int dhtPins[] = {27, 22, 17, 32};
  for (int p = 0; p < 4; p++) {
    int pin = dhtPins[p];
    if (readDHTDirect(pin, true, t, h)) {
      temp = t; humi = h; isSensorError = false; return;
    }
    if (readDHTDirect(pin, false, t, h)) {
      temp = t; humi = h; isSensorError = false; return;
    }
  }
  isSensorError = true;
  temp = 0.0;
  humi = 0.0;
}

// ==========================================
// ส่วนที่ 6: ดึงสภาพอากาศภายนอก (${settings.weatherLocation || 'ปราจีนบุรี'})
// ==========================================
void fetchOutdoorWeather() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(4000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  
  // พิกัด ${settings.weatherLocation || 'ปราจีนบุรี'} (Latitude: ${lat}, Longitude: ${lon})
  const char* weatherUrl = "http://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code";
  
  if (http.begin(weatherUrl)) {
    http.addHeader("User-Agent", "ESP32-Weather");
    int code = http.GET();
    if (code == 200) {
      String res = http.getString();
      int curIdx = res.indexOf("\\\"current\\\":{");
      if (curIdx > 0) {
        String curStr = res.substring(curIdx);
        
        // อ่านอุณหภูมิ
        int tIdx = curStr.indexOf("\\\"temperature_2m\\\":");
        if (tIdx > 0) {
          int tEnd = curStr.indexOf(",", tIdx);
          outTemp = curStr.substring(tIdx + 17, tEnd).toFloat();
        }
        
        // อ่านความชื้น
        int hIdx = curStr.indexOf("\\\"relative_humidity_2m\\\":");
        if (hIdx > 0) {
          int hEnd = curStr.indexOf(",", hIdx);
          outHumi = curStr.substring(hIdx + 23, hEnd).toFloat();
        }
        
        // อ่านสภาพอากาศ
        int wIdx = curStr.indexOf("\\\"weather_code\\\":");
        if (wIdx > 0) {
          int wEnd = curStr.indexOf("}", wIdx);
          int wCode = curStr.substring(wIdx + 15, wEnd).toInt();
          if (wCode == 0) outCondition = "Clear Sky";
          else if (wCode <= 3) outCondition = "Partly Cloudy";
          else if (wCode <= 48) outCondition = "Foggy";
          else if (wCode <= 82) outCondition = "Rainy";
          else outCondition = "Thunderstorm";
        }
      }
    }
    http.end();
  }
}

// ==========================================
// ส่วนที่ 7: หน้าจอ UI ดีไซน์ Dark Mode
// ==========================================
void drawUI() {
  tft.fillScreen(COLOR_BG);
  
  // Header bar
  tft.fillRect(0, 0, 320, 32, tft.color565(26, 32, 42));
  tft.drawLine(0, 32, 320, 32, COLOR_CARD_LINE);
  
  tft.setTextColor(TFT_WHITE, tft.color565(26, 32, 42));
  tft.setTextSize(2);
  tft.drawString("ENVIRONMENT", 10, 8);
  
  // Room Type Tag on Screen
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, tft.color565(26, 32, 42));
  tft.drawString("[ ${roomLabel} ]", 175, 12);
  
  // Time on Header
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeStr[10];
    strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
    tft.setTextColor(COLOR_MUTED, tft.color565(26, 32, 42));
    tft.setTextDatum(TR_DATUM);
    tft.drawString(timeStr, 310, 10);
    tft.setTextDatum(TL_DATUM);
  }

  // Cards layout
  tft.drawRoundRect(10, 40, 145, 115, 8, COLOR_CARD_LINE);
  tft.drawRoundRect(165, 40, 145, 115, 8, COLOR_CARD_LINE);
  
  tft.setTextColor(COLOR_ORANGE, COLOR_BG);
  tft.setTextSize(1);
  tft.drawString("TEMPERATURE", 22, 50);
  
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.drawString("HUMIDITY", 177, 50);
  
  // Outdoor Weather Card
  tft.fillRoundRect(10, 163, 195, 68, 6, COLOR_WEATHER_BG);
  tft.drawRoundRect(10, 163, 195, 68, 6, COLOR_CARD_LINE);
  tft.setTextColor(COLOR_MUTED, COLOR_WEATHER_BG);
  tft.drawString("OUTDOOR (" + outCity + ")", 18, 170);
  
  // Sleep / Wake Button Card
  tft.fillRoundRect(213, 163, 97, 68, 6, COLOR_BTN_SLEEP);
  tft.drawRoundRect(213, 163, 97, 68, 6, tft.color565(70, 120, 200));
  tft.setTextColor(TFT_WHITE, COLOR_BTN_SLEEP);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("SLEEP", 261, 190);
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_BTN_SLEEP);
  tft.drawString("TOUCH SCREEN", 261, 208);
  tft.setTextDatum(TL_DATUM);
}

void drawSensorValues() {
  if (isScreenSleep) return;
  
  // Temperature Card
  tft.fillRect(15, 70, 135, 75, COLOR_BG);
  if (isSensorError || temp == 0.0) {
    tft.setTextColor(COLOR_WARN, COLOR_BG);
    tft.setTextSize(3);
    tft.drawString("0.0", 30, 80);
    tft.setTextSize(1);
    tft.drawString("CHECK SENSOR", 30, 115);
  } else {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.setTextSize(4);
    tft.drawFloat(temp, 1, 22, 75);
    tft.setTextSize(2);
    tft.setTextColor(COLOR_ORANGE, COLOR_BG);
    tft.drawString("\`C", 125, 75);
    
    // Status text
    tft.setTextSize(1);
    if (temp > ${settings.maxTemp}) {
      tft.setTextColor(COLOR_WARN, COLOR_BG);
      tft.drawString("HIGH TEMP", 25, 120);
    } else {
      tft.setTextColor(COLOR_GOOD, COLOR_BG);
      tft.drawString("OPTIMAL", 25, 120);
    }
  }

  // Humidity Card
  tft.fillRect(170, 70, 135, 75, COLOR_BG);
  if (isSensorError || humi == 0.0) {
    tft.setTextColor(COLOR_WARN, COLOR_BG);
    tft.setTextSize(3);
    tft.drawString("0.0", 185, 80);
    tft.setTextSize(1);
    tft.drawString("CHECK SENSOR", 185, 115);
  } else {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.setTextSize(4);
    tft.drawFloat(humi, 1, 175, 75);
    tft.setTextSize(2);
    tft.setTextColor(COLOR_CYAN, COLOR_BG);
    tft.drawString("%", 285, 75);
    
    // Status text
    tft.setTextSize(1);
    if (humi > ${settings.maxHum}) {
      tft.setTextColor(COLOR_WARN, COLOR_BG);
      tft.drawString("HIGH HUMIDITY", 180, 120);
    } else {
      tft.setTextColor(COLOR_GOOD, COLOR_BG);
      tft.drawString("OPTIMAL", 180, 120);
    }
  }

  // Outdoor Weather
  tft.fillRect(15, 185, 185, 40, COLOR_WEATHER_BG);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, COLOR_WEATHER_BG);
  tft.drawFloat(outTemp, 1, 18, 188);
  tft.drawString("\`C", 72, 188);
  
  tft.drawFloat(outHumi, 0, 115, 188);
  tft.drawString("%", 155, 188);
  
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED, COLOR_WEATHER_BG);
  tft.drawString(outCondition, 18, 212);
}

void drawStatusCard() {
  if (isScreenSleep) return;
  // Sync bar
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeStr[10];
    strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
    tft.fillRect(240, 8, 70, 20, tft.color565(26, 32, 42));
    tft.setTextColor(COLOR_MUTED, tft.color565(26, 32, 42));
    tft.setTextDatum(TR_DATUM);
    tft.drawString(timeStr, 310, 10);
    tft.setTextDatum(TL_DATUM);
  }
}

// ==========================================
// ส่วนที่ 8: ฟังก์ชันตรวจสอบการสัมผัส (Touch Sleep / Wake)
// ==========================================
void checkTouch() {
  if (touch.tirqPin && !touch.tirqGround()) {
    if (!touch.touched()) return;
  }
  
  if (touch.touched()) {
    unsigned long now = millis();
    // ป้องกันการกดย้ำ (Debounce 600ms)
    if (now - lastTouchTime < 600) return;
    lastTouchTime = now;

    if (isScreenSleep) {
      // ปลุกหน้าจอให้ติด
      isScreenSleep = false;
      digitalWrite(TFT_BL, HIGH);
      drawUI();
      drawSensorValues();
      drawStatusCard();
    } else {
      TS_Point p = touch.getPoint();
      // แปลงพิกัด CYD 2.8 นิ้ว
      int x = map(p.x, 3800, 200, 0, 320);
      int y = map(p.y, 3800, 200, 0, 240);

      // ถ้ากดที่ปุ่ม SLEEP (ขวาล่าง) หรือแตะที่ใดก็ได้
      if (x >= 210 && y >= 160) {
        isScreenSleep = true;
        digitalWrite(TFT_BL, LOW); // ดับไฟหน้าจอทันที แต่ระบบยังคงทำงานต่อเนื่อง
      }
    }

    // รอให้ปล่อยมือก่อน เพื่อไม่ให้เกิดการสลับโหมดซ้ำ
    while (touch.touched()) {
      delay(20);
    }
  }
}

// ==========================================
// ส่วนที่ 9: Setup & Loop หลัก
// ==========================================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // ป้องกันบอร์ดรีสตาร์ท
  Serial.begin(115200);

  // ตั้งค่าไฟหน้าจอ Backlight
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

  // ตั้งค่าจอภาพ
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(COLOR_BG);

  // ตั้งค่าระบบสัมผัส Touch
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin(touchSpi);
  touch.setRotation(1);

  // แสดงหน้าจอเริ่มระบบ
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(2);
  tft.drawString("SENSORFLOW IOT", 160, 90);
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.drawString("Connecting to WiFi...", 160, 130);
  tft.setTextDatum(TL_DATUM);

  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    retry++;
  }

  // ซิงค์เวลา NTP
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // อ่านเซนเซอร์และสภาพอากาศรอบแรก
  readSensorAuto();
  fetchOutdoorWeather();

  // วาดหน้าจอ UI หลัก
  drawUI();
  drawSensorValues();
  drawStatusCard();
}

void loop() {
  // ตรวจจับการสัมผัสจอ (Sleep / Wake)
  checkTouch();

  // อ่านค่าเซ็นเซอร์ทุก 2 วินาที
  if (millis() - lastSensorRead > 2000) {
    readSensorAuto();
    drawSensorValues();
    lastSensorRead = millis();
  }

  // อัปเดตสภาพอากาศภายนอกจาก Internet ทุก 10 นาที
  if (millis() - lastWeatherUpdate > 600000) {
    fetchOutdoorWeather();
    drawSensorValues();
    lastWeatherUpdate = millis();
  }

  // อัปเดตนาฬิกาหัวจอทุก 10 วินาที
  if (millis() - lastClockUpdate > 10000) {
    drawStatusCard();
    lastClockUpdate = millis();
  }

  // ส่งข้อมูลเข้า Cloud Firestore ตามรอบที่กำหนด
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    if (http.begin(client, serverUrl)) {
      http.addHeader("Content-Type", "application/json");
      
      time_t now; time(&now);
      String json = "{\\\"fields\\\": {";
      json += "\\\"temperature\\\": {\\\"doubleValue\\\": " + String(temp, 1) + "},";
      json += "\\\"humidity\\\": {\\\"doubleValue\\\": " + String(humi, 1) + "},";
      json += "\\\"sensor_error\\\": {\\\"booleanValue\\\": " + String(isSensorError ? "true" : "false") + "},";
      json += "\\\"timestamp\\\": {\\\"integerValue\\\": \\\"" + String((unsigned long)now) + "000\\\"}";
      json += "}}";

      lastCloudCode = http.POST(json);
      if (lastCloudCode == 200) {
        struct tm timeinfo;
        if (getLocalTime(&timeinfo)) {
          char timeStr[10];
          strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
          lastSyncOK = String(timeStr);
        }
      }
      drawStatusCard();
      http.end();
    }
    lastSend = millis();
  }
}`;
}
