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
#include <math.h>
#include "soc/soc.h" 
#include "soc/rtc_cntl_reg.h" 

// --- 0. ตั้งค่า WiFi บ้านล่วงหน้า (ค่าเริ่มต้น) ---
const char* WIFI_SSID = "Mai_home_2.4G"; 
const char* WIFI_PASSWORD = "0909142651"; 

// --- ชื่อจุดติดตั้งอุปกรณ์ (เช่น MY BEDROOM, BEDROOM, LIVING ROOM) ---
const char* ROOM_NAME = "MY BEDROOM"; 

// --- 1. การเชื่อมต่อ Server & Cloud Firestore ---
const char* serverUrl = "https://firestore.googleapis.com/v1/projects/gen-lang-client-0516953163/databases/ai-studio-iotsensordashboa-6c74a260-d381-44d8-ae58-a587051c2d98/documents/sensor_data?key=AIzaSyCXLGKCPAStDBt0RTcCUdX3ew4c_uB6oxs";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ CYD 2.8" (ESP32-2432S028R) ---
#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33
#define TFT_BL 21 

// ใช้ VSPI บัส และ XPT2046_Touchscreen ts(XPT2046_CS, XPT2046_IRQ) ตามโค้ดที่คุณเทสผ่าน 100%
SPIClass touchSpi = SPIClass(VSPI);
XPT2046_Touchscreen ts(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- 3. จานสีธีม Modern Dark Dashboard & Smart Clock ---
#define COLOR_BG          tft.color565(18, 22, 28) 
#define COLOR_CARD_LINE   tft.color565(42, 50, 64) 
#define COLOR_ORANGE      tft.color565(255, 95, 45) 
#define COLOR_CYAN        tft.color565(50, 180, 255) 
#define COLOR_MUTED       tft.color565(140, 150, 165) 
#define COLOR_BTN_SLEEP   tft.color565(25, 45, 80)
#define COLOR_BTN_CLOCK   tft.color565(35, 80, 150)
#define COLOR_WEATHER_BG  tft.color565(15, 28, 48)
#define COLOR_GOOD        tft.color565(50, 220, 120)
#define COLOR_WARN        tft.color565(255, 190, 40)

// จานสีโหมดนาฬิกาตั้งโต๊ะ (Smart Clock Face)
#define COLOR_CLOCK_BG    tft.color565(16, 20, 28)
#define COLOR_ARC_CYAN    tft.color565(45, 215, 255)
#define COLOR_ARC_ORANGE  tft.color565(255, 130, 45)
#define COLOR_ARC_TRACK   tft.color565(32, 40, 52)
#define COLOR_CLOCK_TEXT  tft.color565(245, 248, 255)

// สีตัวเลขนาฬิกา (ชั่วโมงกับนาทีคนละสี สวยงามโดดเด่น ไม่กลืนกัน)
#define COLOR_HOUR        tft.color565(60, 225, 255) // สีฟ้า Cyan สว่างสดใส
#define COLOR_COLON       tft.color565(255, 255, 255) // จุดกระพริบสีขาว
#define COLOR_MINUTE      tft.color565(255, 205, 50)  // สีทองสว่าง Amber Gold สดใส

// โหมดหน้าจอ
enum ScreenMode {
  SCREEN_DASHBOARD = 0,
  SCREEN_CLOCK = 1
};
ScreenMode currentScreen = SCREEN_DASHBOARD;

// --- 4. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
float prevTempClock = -999.0, prevHumiClock = -999.0; // เก็บค่าเก่าเพื่อวาดเฉพาะตอนค่าเปลี่ยน (แก้จอกระพริบ 100%)
String prevClockTime = "";
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
String lastRenderedTime = "";

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
// ฟังก์ชันวาดเส้นโค้งเกจแบบนุ่มนวล (Arc Gauge Helper)
// ==========================================
void drawCurvedArc(int cx, int cy, int r, int thickness, float startDeg, float endDeg, uint16_t color) {
  for (float a = startDeg; a <= endDeg; a += 1.2) {
    float rad = a * 0.0174532925;
    float cosA = cos(rad);
    float sinA = sin(rad);
    for (int t = 0; t < thickness; t++) {
      int px = cx + (int)((r + t) * cosA);
      int py = cy + (int)((r + t) * sinA);
      if (px >= 0 && px < 320 && py >= 0 && py < 240) {
        tft.drawPixel(px, py, color);
      }
    }
  }
}

// ==========================================
// ส่วนที่ 7: หน้าจอ UI ดีไซน์ Dark Mode (Dashboard) - ขยายตัวเลขอุณหภูมิ & ความชื้นใหญ่ชัดเจน
// ==========================================
void drawUI() {
  tft.fillScreen(COLOR_BG);
  
  // Header bar แสดงชื่อจุดติดตั้ง เช่น "MY BEDROOM"
  tft.fillRect(0, 0, 320, 28, tft.color565(24, 30, 40));
  tft.drawLine(0, 28, 320, 28, COLOR_CARD_LINE);
  
  tft.setTextColor(TFT_WHITE, tft.color565(24, 30, 40));
  tft.setTextSize(2);
  tft.drawString(ROOM_NAME, 8, 6);
  
  // Room Type Tag on Screen
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, tft.color565(24, 30, 40));
  tft.drawString("[ ${roomLabel} ]", 175, 10);
  
  // Time on Header
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeStr[10];
    strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
    tft.setTextColor(COLOR_MUTED, tft.color565(24, 30, 40));
    tft.setTextDatum(TR_DATUM);
    tft.drawString(timeStr, 312, 8);
    tft.setTextDatum(TL_DATUM);
  }

  // Cards layout (กว้างขึ้นและใหญ่ขึ้น)
  tft.drawRoundRect(6, 34, 150, 126, 8, COLOR_CARD_LINE);
  tft.drawRoundRect(164, 34, 150, 126, 8, COLOR_CARD_LINE);
  
  tft.setTextColor(COLOR_ORANGE, COLOR_BG);
  tft.setTextSize(1);
  tft.drawString("TEMPERATURE", 16, 42);
  
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.drawString("HUMIDITY", 174, 42);
  
  // 1. Outdoor Weather Card (ซ้ายล่าง)
  tft.fillRoundRect(6, 166, 114, 68, 6, COLOR_WEATHER_BG);
  tft.drawRoundRect(6, 166, 114, 68, 6, COLOR_CARD_LINE);
  tft.setTextColor(COLOR_MUTED, COLOR_WEATHER_BG);
  tft.drawString("OUTDOOR", 12, 172);
  
  // 2. ปุ่ม CLOCK (ตรงกลางล่าง - กดเพื่อเข้าหน้านาฬิกาตามภาพ)
  tft.fillRoundRect(126, 166, 92, 68, 6, COLOR_BTN_CLOCK);
  tft.drawRoundRect(126, 166, 92, 68, 6, tft.color565(75, 150, 245));
  tft.setTextColor(TFT_WHITE, COLOR_BTN_CLOCK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(2);
  tft.drawString("CLOCK", 172, 190);
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_BTN_CLOCK);
  tft.drawString("DESK MODE", 172, 214);
  tft.setTextDatum(TL_DATUM);

  // 3. ปุ่ม SLEEP (ขวาล่าง - กดเพื่อพักหน้าจอ)
  tft.fillRoundRect(224, 166, 90, 68, 6, COLOR_BTN_SLEEP);
  tft.drawRoundRect(224, 166, 90, 68, 6, tft.color565(70, 110, 180));
  tft.setTextColor(TFT_WHITE, COLOR_BTN_SLEEP);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(2);
  tft.drawString("SLEEP", 269, 190);
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED, COLOR_BTN_SLEEP);
  tft.drawString("TOUCH OFF", 269, 214);
  tft.setTextDatum(TL_DATUM);
}

void drawSensorValues() {
  if (isScreenSleep || currentScreen != SCREEN_DASHBOARD) return;
  
  // Temperature Card - ตัวเลขใหญ่ยักษ์ TextSize 5 ชัดเจน
  tft.fillRect(10, 58, 142, 98, COLOR_BG);
  if (isSensorError || temp == 0.0) {
    tft.setTextColor(COLOR_WARN, COLOR_BG);
    tft.setTextSize(4);
    tft.drawString("--.-", 24, 72);
    tft.setTextSize(1);
    tft.drawString("CHECK SENSOR", 24, 130);
  } else {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.setTextSize(5); // ขนาดใหญ่พิเศษ 5 คมชัดเต็มตา
    tft.drawFloat(temp, 1, 14, 62);
    
    tft.setTextSize(2);
    tft.setTextColor(COLOR_ORANGE, COLOR_BG);
    tft.drawString("\`C", 126, 64);
    
    // Status text & Bar
    tft.setTextSize(1);
    if (temp > ${settings.maxTemp}) {
      tft.fillRect(14, 132, 134, 4, COLOR_WARN);
      tft.setTextColor(COLOR_WARN, COLOR_BG);
      tft.drawString("HIGH TEMP ALERT", 16, 118);
    } else {
      tft.fillRect(14, 132, 134, 4, COLOR_GOOD);
      tft.setTextColor(COLOR_GOOD, COLOR_BG);
      tft.drawString("OPTIMAL STATUS", 16, 118);
    }
  }

  // Humidity Card - ตัวเลขใหญ่ยักษ์ TextSize 5 ชัดเจน
  tft.fillRect(168, 58, 142, 98, COLOR_BG);
  if (isSensorError || humi == 0.0) {
    tft.setTextColor(COLOR_WARN, COLOR_BG);
    tft.setTextSize(4);
    tft.drawString("--.-", 182, 72);
    tft.setTextSize(1);
    tft.drawString("CHECK SENSOR", 182, 130);
  } else {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.setTextSize(5); // ขนาดใหญ่พิเศษ 5 คมชัดเต็มตา
    tft.drawFloat(humi, 1, 172, 62);
    
    tft.setTextSize(2);
    tft.setTextColor(COLOR_CYAN, COLOR_BG);
    tft.drawString("%", 286, 64);
    
    // Status text & Bar
    tft.setTextSize(1);
    if (humi > ${settings.maxHum}) {
      tft.fillRect(172, 132, 134, 4, COLOR_WARN);
      tft.setTextColor(COLOR_WARN, COLOR_BG);
      tft.drawString("HIGH HUMIDITY", 174, 118);
    } else {
      tft.fillRect(172, 132, 134, 4, COLOR_GOOD);
      tft.setTextColor(COLOR_GOOD, COLOR_BG);
      tft.drawString("OPTIMAL STATUS", 174, 118);
    }
  }

  // Outdoor Weather
  tft.fillRect(10, 186, 106, 44, COLOR_WEATHER_BG);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, COLOR_WEATHER_BG);
  tft.drawFloat(outTemp, 1, 12, 188);
  tft.drawString("\`C", 62, 188);
  
  tft.setTextSize(1);
  tft.setTextColor(COLOR_MUTED, COLOR_WEATHER_BG);
  tft.drawString(outCondition.substring(0, 11), 12, 212);
}

// ==========================================
// ส่วนที่ 8: หน้าจอโหมดนาฬิกาตั้งโต๊ะอัจฉริยะ (Smart Clock Face)
// ==========================================
void updateClockDigits(bool forceRedraw = false) {
  if (isScreenSleep || currentScreen != SCREEN_CLOCK) return;
  
  struct tm timeinfo;
  char hourStr[4] = "12";
  char minStr[4] = "00";
  if (getLocalTime(&timeinfo)) {
    strftime(hourStr, sizeof(hourStr), "%H", &timeinfo);
    strftime(minStr, sizeof(minStr), "%M", &timeinfo);
  }
  
  String currentFormatted = String(hourStr) + ":" + String(minStr);
  if (!forceRedraw && currentFormatted == prevClockTime) return;
  prevClockTime = currentFormatted;

  // เคลียร์เฉพาะพื้นที่ตัวเลขตรงกลาง (ไม่มีการกระพริบ fillScreen)
  tft.fillRect(48, 62, 224, 62, COLOR_CLOCK_BG);

  // วาดชั่วโมง (สีฟ้าสดใส Cyan)
  tft.setTextColor(COLOR_HOUR, COLOR_CLOCK_BG);
  tft.setTextDatum(TR_DATUM);
  tft.setTextSize(6);
  tft.drawString(String(hourStr), 145, 66);

  // วาดจุดโคลอนคั่นเวลา (สีขาว White)
  tft.setTextColor(COLOR_COLON, COLOR_CLOCK_BG);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(":", 160, 64);

  // วาดนาที (สีทองอำพันสดใส Amber Gold)
  tft.setTextColor(COLOR_MINUTE, COLOR_CLOCK_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(String(minStr), 175, 66);
  
  tft.setTextDatum(TL_DATUM);
}

void updateClockSensors(bool forceRedraw = false) {
  if (isScreenSleep || currentScreen != SCREEN_CLOCK) return;

  // ตรวจสอบว่าค่าเปลี่ยนหรือไม่ ถ้าไม่เปลี่ยนไม่ต้องวาดใหม่ (ป้องกันจอกระพริบ)
  if (!forceRedraw && fabs(temp - prevTempClock) < 0.1 && fabs(humi - prevHumiClock) < 0.5) return;
  prevTempClock = temp;
  prevHumiClock = humi;

  // 1. อัปเดตเส้นโค้งฝั่งซ้าย (Temperature Arc & Indicator)
  drawCurvedArc(160, 105, 105, 5, 125, 235, COLOR_CLOCK_BG); // ลบของเดิม
  drawCurvedArc(160, 105, 105, 3, 125, 235, COLOR_ARC_TRACK);
  
  float tempClamped = constrain(temp, 0.0, 50.0);
  float leftEndDeg = 235.0 - ((tempClamped / 50.0) * 105.0);
  drawCurvedArc(160, 105, 105, 4, leftEndDeg, 235, COLOR_ARC_CYAN);
  
  float radL = leftEndDeg * 0.0174532925;
  int indLx = 160 + (int)(106 * cos(radL));
  int indLy = 105 + (int)(106 * sin(radL));
  tft.fillCircle(indLx, indLy, 5, COLOR_ARC_CYAN);
  tft.drawCircle(indLx, indLy, 5, TFT_WHITE);
  tft.fillCircle(indLx, indLy, 2, COLOR_CLOCK_BG);

  // ตัวเลขอุณหภูมิซ้าย
  tft.fillRect(2, 92, 60, 40, COLOR_CLOCK_BG);
  tft.setTextColor(COLOR_ARC_CYAN, COLOR_CLOCK_BG);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.drawString("INDOOR", 32, 98);
  tft.setTextSize(2);
  tft.drawString(String(temp, 1) + "\`C", 32, 116);

  // 2. อัปเดตเส้นโค้งฝั่งขวา (Humidity Arc & Indicator)
  drawCurvedArc(160, 105, 105, 5, -55, 55, COLOR_CLOCK_BG); // ลบของเดิม
  drawCurvedArc(160, 105, 105, 3, -55, 55, COLOR_ARC_TRACK);
  
  float humClamped = constrain(humi, 0.0, 100.0);
  float rightEndDeg = -55.0 + ((humClamped / 100.0) * 110.0);
  drawCurvedArc(160, 105, 105, 4, -55, rightEndDeg, COLOR_ARC_ORANGE);
  
  float radR = rightEndDeg * 0.0174532925;
  int indRx = 160 + (int)(106 * cos(radR));
  int indRy = 105 + (int)(106 * sin(radR));
  tft.fillCircle(indRx, indRy, 4, COLOR_ARC_ORANGE);
  tft.drawCircle(indRx, indRy, 4, TFT_WHITE);

  // ตัวเลขความชื้นขวา
  tft.fillRect(258, 92, 60, 40, COLOR_CLOCK_BG);
  tft.setTextColor(COLOR_ARC_ORANGE, COLOR_CLOCK_BG);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.drawString("HUMIDITY", 288, 98);
  tft.setTextSize(2);
  tft.drawString(String((int)humi) + "%", 288, 116);
  tft.setTextDatum(TL_DATUM);
}

void drawClockWeatherInfo() {
  if (isScreenSleep || currentScreen != SCREEN_CLOCK) return;
  
  tft.fillRect(60, 138, 200, 52, COLOR_CLOCK_BG);
  
  // สัญลักษณ์สภาพอากาศจำลอง
  tft.fillCircle(105, 155, 8, tft.color565(255, 195, 35));
  tft.fillRoundRect(95, 157, 28, 14, 5, tft.color565(60, 75, 95));
  tft.fillCircle(102, 157, 7, tft.color565(60, 75, 95));
  tft.fillCircle(114, 155, 8, tft.color565(60, 75, 95));

  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(TFT_WHITE, COLOR_CLOCK_BG);
  tft.setTextSize(3);
  tft.drawString(String(outTemp, 0) + "\`C", 132, 155);
  
  tft.setTextColor(COLOR_MUTED, COLOR_CLOCK_BG);
  tft.setTextSize(1);
  tft.drawString(outCondition + " (" + outCity.substring(0, 8) + ")", 95, 180);
  tft.setTextDatum(TL_DATUM);
}

void drawClockScreen() {
  tft.fillScreen(COLOR_CLOCK_BG);
  
  // 1. วาดเส้นขอบตกแต่งด้านข้าง
  tft.drawFastVLine(0, 0, 240, tft.color565(30, 40, 55));
  tft.drawFastVLine(319, 0, 240, tft.color565(30, 40, 55));
  
  // 2. แถบข้อมูลด้านบน (ชื่อจุดติดตั้ง & วันที่)
  struct tm timeinfo;
  char dateStr[30] = "ESP32 SMART CLOCK";
  if (getLocalTime(&timeinfo)) {
    strftime(dateStr, sizeof(dateStr), "%A, %d %b", &timeinfo);
  }
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(COLOR_CYAN, COLOR_CLOCK_BG);
  tft.drawString(ROOM_NAME, 160, 12);
  tft.setTextColor(COLOR_MUTED, COLOR_CLOCK_BG);
  tft.drawString(dateStr, 160, 25);
  tft.setTextDatum(TL_DATUM);

  // 3. วาดเกจและค่าเซนเซอร์
  updateClockSensors(true);

  // 4. วาดตัวเลขนาฬิกา (ชั่วโมง Cyan / นาที Amber-Gold)
  updateClockDigits(true);

  // 5. สภาพอากาศภายนอก
  drawClockWeatherInfo();

  // 6. ปุ่มเมนูสัมผัสแถบล่าง
  tft.fillRoundRect(20, 205, 130, 28, 5, tft.color565(25, 35, 50));
  tft.drawRoundRect(20, 205, 130, 28, 5, tft.color565(50, 70, 100));
  tft.setTextColor(COLOR_CYAN, tft.color565(25, 35, 50));
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(1);
  tft.drawString("< DASHBOARD", 85, 219);

  tft.fillRoundRect(170, 205, 130, 28, 5, COLOR_BTN_SLEEP);
  tft.drawRoundRect(170, 205, 130, 28, 5, tft.color565(60, 100, 160));
  tft.setTextColor(TFT_WHITE, COLOR_BTN_SLEEP);
  tft.drawString("SLEEP >", 235, 219);
  tft.setTextDatum(TL_DATUM);
}

void drawStatusCard() {
  if (isScreenSleep) return;
  if (currentScreen == SCREEN_DASHBOARD) {
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
  } else if (currentScreen == SCREEN_CLOCK) {
    updateClockDigits();
  }
}

// ==========================================
// ส่วนที่ 9: ฟังก์ชันตรวจสอบการสัมผัส (Touch Sleep / Wake / Mode Switch)
// ==========================================
void checkTouch() {
  if (!ts.touched()) return;
  
  TS_Point p = ts.getPoint();

  unsigned long now = millis();
  // ป้องกันการกดย้ำ (Debounce 350ms)
  if (now - lastTouchTime < 350) return;
  lastTouchTime = now;

  if (isScreenSleep) {
    // ปลุกหน้าจอให้ติด
    isScreenSleep = false;
    digitalWrite(TFT_BL, HIGH);
    if (currentScreen == SCREEN_CLOCK) {
      drawClockScreen();
    } else {
      drawUI();
      drawSensorValues();
      drawStatusCard();
    }
  } else {
    // แปลงพิกัดตามสูตรที่ทดสอบผ่านจริง 100%
    int x = map(p.x, 200, 3700, 0, 320);
    int y = map(p.y, 240, 3800, 0, 240);
    x = constrain(x, 0, 320);
    y = constrain(y, 0, 240);

    if (currentScreen == SCREEN_DASHBOARD) {
      // แตะปุ่ม CLOCK (กลางล่าง: x: 120..220, y >= 155)
      if (x >= 120 && x <= 222 && y >= 155) {
        currentScreen = SCREEN_CLOCK;
        drawClockScreen();
      }
      // แตะปุ่ม SLEEP (ขวาล่าง: x >= 223, y >= 155)
      else if (x >= 223 && y >= 155) {
        isScreenSleep = true;
        digitalWrite(TFT_BL, LOW); // ดับไฟหน้าจอทันที
      }
    } else if (currentScreen == SCREEN_CLOCK) {
      // แตะปุ่ม SLEEP ในหน้านาฬิกา (ขวาล่าง: x >= 165 && y >= 190)
      if (x >= 165 && y >= 190) {
        isScreenSleep = true;
        digitalWrite(TFT_BL, LOW);
      }
      // แตะปุ่ม DASHBOARD หรือแตะส่วนใดๆ บนหน้าจอเพื่อกลับหน้าแดชบอร์ด
      else {
        currentScreen = SCREEN_DASHBOARD;
        drawUI();
        drawSensorValues();
        drawStatusCard();
      }
    }
  }

  // รอจนกว่าจะยกนิ้วออก ป้องกันการเด้งไปมา
  unsigned long releaseTimer = millis();
  while (ts.touched() && (millis() - releaseTimer < 600)) {
    delay(20);
  }
}

// ==========================================
// ส่วนที่ 10: Setup & Loop หลัก
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

  // ตั้งค่าระบบสัมผัส Touch ตามโค้ดที่เทสผ่าน
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  ts.begin(touchSpi);
  ts.setRotation(1);

  // แสดงหน้าจอเริ่มระบบ (Splash Screen) พร้อมชื่อจุดติดตั้ง เช่น "MY BEDROOM"
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(3);
  tft.drawString(ROOM_NAME, 160, 75); // แสดงชื่อจุดติดตั้งขนาดใหญ่
  
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString("ESP32 IOT SENSOR MONITOR", 160, 110);

  tft.setTextColor(COLOR_MUTED, COLOR_BG);
  tft.drawString("Connecting to WiFi...", 160, 145);
  tft.setTextDatum(TL_DATUM);

  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    retry++;
  }

  // ซิงค์เวลา NTP ประเทศไทย (UTC+7)
  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // อ่านเซนเซอร์และสภาพอากาศรอบแรก
  readSensorAuto();
  fetchOutdoorWeather();

  // วาดหน้าจอ UI เริ่มต้น
  drawUI();
  drawSensorValues();
  drawStatusCard();
}

void loop() {
  // ตรวจจับการสัมผัสจอ (Sleep / Wake / สลับโหมด)
  checkTouch();

  // อ่านค่าเซ็นเซอร์ทุก 2 วินาที (อัปเดตเฉพาะส่วน ไม่ล้างทั้งจอ ไม่กระพริบ 100%)
  if (millis() - lastSensorRead > 2000) {
    readSensorAuto();
    if (currentScreen == SCREEN_DASHBOARD) {
      drawSensorValues();
    } else if (currentScreen == SCREEN_CLOCK) {
      updateClockSensors();
    }
    lastSensorRead = millis();
  }

  // อัปเดตสภาพอากาศภายนอกจาก Internet ทุก 10 นาที
  if (millis() - lastWeatherUpdate > 600000) {
    fetchOutdoorWeather();
    if (currentScreen == SCREEN_DASHBOARD) {
      drawSensorValues();
    } else if (currentScreen == SCREEN_CLOCK) {
      drawClockWeatherInfo();
    }
    lastWeatherUpdate = millis();
  }

  // อัปเดตนาฬิกาทุก 1 วินาที (ตัวเลขชั่วโมง Cyan / นาที Amber-Gold คมชัดนิ่งสนิท)
  if (millis() - lastClockUpdate > 1000) {
    drawStatusCard();
    if (currentScreen == SCREEN_CLOCK) {
      updateClockDigits();
    }
    lastClockUpdate = millis();
  }

  // ส่งข้อมูลเข้า Cloud Firestore ตามรอบที่กำหนด (ทำงานต่อเนื่องในเบื้องหลัง)
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
