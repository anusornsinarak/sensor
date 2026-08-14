import fs from 'fs';

const updatedSketch = `#include <functional>
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
#define COLOR_BTN_SLEEP tft.color565(40, 65, 110)
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
bool isScreenSleep = false; // สถานะโหมดพักหน้าจอ

// สภาพอากาศภายนอก (พิกัด: ปราจีนบุรี)
float outTemp = 0.0;
float outHumi = 0.0;
String outCity = "Prachinburi";
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
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == LOW) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  noInterrupts();
  for (int i = 0; i < 40; i++) {
    unsigned long startLow = micros();
    while(digitalRead(pin) == LOW) {
      if (micros() - startLow > 100) { interrupts(); return false; }
    }
    unsigned long startHigh = micros();
    while(digitalRead(pin) == HIGH) {
      if (micros() - startHigh > 100) { interrupts(); return false; }
    }
    if ((micros() - startHigh) > 40) {
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
// ส่วนที่ 6: ดึงสภาพอากาศภายนอก (พิกัด: ปราจีนบุรี)
// ==========================================
void fetchOutdoorWeather() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(4000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  
  // พิกัด ปราจีนบุรี (Latitude: 14.0509, Longitude: 101.3716)
  const char* weatherUrl = "http://api.open-meteo.com/v1/forecast?latitude=14.0509&longitude=101.3716&current=temperature_2m,relative_humidity_2m,weather_code";
  
  if (http.begin(weatherUrl)) {
    http.addHeader("User-Agent", "ESP32-Weather");
    int code = http.GET();
    if (code == 200) {
      String res = http.getString();
      int curIdx = res.indexOf("\"current\":{");
      if (curIdx > 0) {
        String curStr = res.substring(curIdx);
        
        // อ่านอุณหภูมิ
        int tIdx = curStr.indexOf("\"temperature_2m\":");
        if (tIdx > 0) {
          int tEnd = curStr.indexOf(",", tIdx);
          outTemp = curStr.substring(tIdx + 17, tEnd).toFloat();
        }
        
        // อ่านความชื้น
        int hIdx = curStr.indexOf("\"relative_humidity_2m\":");
        if (hIdx > 0) {
          int hEnd = curStr.indexOf(",", hIdx);
          outHumi = curStr.substring(hIdx + 23, hEnd).toFloat();
        }
        
        // อ่านสภาพท้องฟ้า
        int wIdx = curStr.indexOf("\"weather_code\":");
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
  
  // เส้นแบ่งสัดส่วน
  tft.drawFastHLine(0, 46, 320, COLOR_CARD_LINE);  // ใต้เวลา
  tft.drawFastVLine(160, 46, 102, COLOR_CARD_LINE); // แบ่งกลาง อุณหภูมิ/ความชื้น
  tft.drawFastHLine(0, 148, 320, COLOR_CARD_LINE); // เหนือกล่องสภาพอากาศภายนอก
  tft.drawFastHLine(0, 194, 320, COLOR_CARD_LINE); // เหนือแถบสถานะด้านล่าง
  
  // หัวข้อ (Labels)
  tft.setTextColor(COLOR_ORANGE, COLOR_BG);
  tft.drawCentreString("TEMP (C)", 80, 52, 2);
  
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.drawCentreString("HUMIDITY (%)", 240, 52, 2);

  // ปุ่มพักหน้าจอ (SLEEP) มุมขวาล่าง
  tft.fillRoundRect(220, 198, 96, 38, 4, COLOR_BTN_SLEEP);
  tft.setTextColor(TFT_WHITE, COLOR_BTN_SLEEP);
  tft.drawCentreString("SLEEP", 268, 210, 2);
}

void drawTime() {
  if (isScreenSleep) return;
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeStr[15];
    strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
    char dateStr[20];
    strftime(dateStr, sizeof(dateStr), "%d %b %Y", &timeinfo);
    
    tft.fillRect(0, 0, 320, 44, COLOR_BG); 
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.drawCentreString(timeStr, 120, 8, 4); // นาฬิกา
    
    tft.setTextColor(COLOR_MUTED, COLOR_BG);
    tft.drawString(dateStr, 220, 14, 2); // วันที่
  } else {
    tft.fillRect(0, 0, 320, 44, COLOR_BG); 
    tft.setTextColor(COLOR_MUTED, COLOR_BG);
    tft.drawCentreString("Waiting for Time...", 160, 12, 2);
  }
}

void drawSensorValues() {
  if (isScreenSleep) return;
  tft.fillRect(0, 72, 155, 74, COLOR_BG);
  tft.fillRect(165, 72, 155, 74, COLOR_BG);
  
  if (!isSensorError) {
    tft.setTextColor(COLOR_ORANGE, COLOR_BG);
    tft.drawCentreString(String(temp, 1), 80, 72, 6); // ตัวเลขอุณหภูมิ
    
    // ประเมินสถานะอุณหภูมิ (ตามภาพที่ 1: ปกติสำหรับห้องทั่วไป)
    String tempStatusText = "NORMAL (ROOM)";
    uint16_t tempColor = COLOR_GOOD;
    if (temp > 30.0) { tempStatusText = "HIGH TEMP!"; tempColor = TFT_RED; }
    else if (temp < 20.0) { tempStatusText = "COOL"; tempColor = COLOR_CYAN; }
    
    tft.setTextColor(tempColor, COLOR_BG);
    tft.drawCentreString(tempStatusText, 80, 128, 2);
    
    tft.setTextColor(COLOR_CYAN, COLOR_BG);
    tft.drawCentreString(String(humi, 1), 240, 72, 6); // ตัวเลขความชื้น
    
    // ประเมินสถานะความชื้น (ตามภาพที่ 1: เหมาะสมสำหรับห้องทั่วไป)
    String humiStatusText = "OPTIMAL (ROOM)";
    uint16_t humiColor = COLOR_GOOD;
    if (humi > 70.0) { humiStatusText = "HIGH HUMI"; humiColor = COLOR_WARN; }
    else if (humi < 40.0) { humiStatusText = "DRY AIR"; humiColor = COLOR_WARN; }
    
    tft.setTextColor(humiColor, COLOR_BG);
    tft.drawCentreString(humiStatusText, 240, 128, 2);
  } else {
    tft.setTextColor(TFT_RED, COLOR_BG);
    tft.drawCentreString("ERR", 80, 85, 4);
    tft.drawCentreString("ERR", 240, 85, 4);
    tft.setTextColor(COLOR_MUTED, COLOR_BG);
    tft.drawCentreString("CHECK SENSOR", 80, 128, 2);
    tft.drawCentreString("CHECK SENSOR", 240, 128, 2);
  }
}

// วาดการ์ดสภาพอากาศภายนอกจากอินเทอร์เน็ต (พิกัด: ปราจีนบุรี)
void drawOutdoorWeatherCard() {
  if (isScreenSleep) return;
  tft.fillRect(4, 150, 312, 42, COLOR_WEATHER_BG);
  tft.drawRoundRect(4, 150, 312, 42, 4, COLOR_CARD_LINE);
  
  // บรรทัดบน: ชื่อเมือง และ สภาพอากาศ
  tft.setTextColor(TFT_WHITE, COLOR_WEATHER_BG);
  String line1 = "EXT: " + outCity + " | " + outCondition;
  tft.drawString(line1, 10, 154, 2);
  
  // บรรทัดล่าง: อุณหภูมิและความชื้นภายนอก
  tft.setTextColor(COLOR_MUTED, COLOR_WEATHER_BG);
  String line2 = "Out: " + String(outTemp, 1) + " C  |  Humi: " + String(outHumi, 0) + "%";
  tft.drawString(line2, 10, 172, 2);
}

void drawStatusCard() {
  if (isScreenSleep) return;
  tft.fillRect(0, 196, 215, 44, COLOR_BG);
  
  tft.setTextColor(COLOR_MUTED, COLOR_BG);
  String cloudStatus = "Cloud: " + String(lastCloudCode == 200 ? "OK" : String(lastCloudCode));
  tft.drawString(cloudStatus, 8, 200, 2);
  tft.drawString("Sync: " + lastSyncOK + " | " + WiFi.localIP().toString(), 8, 220, 1);

  // วาดปุ่ม SLEEP
  tft.fillRoundRect(220, 198, 96, 38, 4, COLOR_BTN_SLEEP);
  tft.setTextColor(TFT_WHITE, COLOR_BTN_SLEEP);
  tft.drawCentreString("SLEEP", 268, 210, 2);
}

// ==========================================
// ส่วนที่ 8: ฟังก์ชัน Setup & Loop
// ==========================================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); 
  Serial.begin(115200);
  
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
  
  tft.init();
  tft.setRotation(1);
  
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin(touchSpi);
  touch.setRotation(1);
  
  // วาดหน้าจอเชื่อมต่อ WiFi
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawCentreString("Connecting WiFi...", 160, 90, 4);
  tft.setTextColor(COLOR_MUTED, COLOR_BG);
  tft.drawCentreString(WIFI_SSID, 160, 130, 2);

  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  if (strlen(WIFI_SSID) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 25) {
      delay(400);
      retry++;
    }
  } 
  // ถ้าเชื่อมต่อ WiFi ไม่สำเร็จ ระบบจะเปิดหน้า WiFi Config Portal อัตโนมัติทันที
  if (WiFi.status() != WL_CONNECTED) {
    tft.fillScreen(COLOR_BG);
    tft.setTextColor(COLOR_WARN, COLOR_BG);
    tft.drawCentreString("WiFi Failed! Opening AP", 160, 80, 4);
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.drawCentreString("Connect AP: CYD_ESP32_LIGHT", 160, 120, 2);
    tft.drawCentreString("IP: 192.168.4.1 to configure", 160, 145, 2);
    
    WiFiManager wm;
    wm.setConfigPortalTimeout(180);
    wm.setBreakAfterConfig(true);
    wm.autoConnect("CYD_ESP32_LIGHT");
  }

  // วาดหน้าจอ UI
  drawUI();
  configTime(25200, 0, "asia.pool.ntp.org", "pool.ntp.org", "time.nist.gov");
  
  // อ่านและวาดค่าเซนเซอร์ครั้งแรก
  readSensorAuto();
  drawSensorValues();
  
  // ดึงสภาพอากาศภายนอก (ปราจีนบุรี)
  fetchOutdoorWeather();
  drawOutdoorWeatherCard();
  drawStatusCard();
}

void loop() {
  // 1. ระบบสัมผัสหน้าจอ (เปิด/ปิดโหมด Sleep ดับไฟหน้าจอตอนนอน)
  if (touch.touched() || touch.tirqTouched()) {
    TS_Point p = touch.getPoint();
    int screenX = map(p.x, 200, 3800, 0, 320);
    int screenY = map(p.y, 240, 3800, 0, 240);

    if (isScreenSleep) {
      // เมื่อแตะหน้าจอขณะที่หลับอยู่ -> ปลุกหน้าจอให้สว่างกลับมาทันที
      isScreenSleep = false;
      digitalWrite(TFT_BL, HIGH);
      drawUI();
      drawTime();
      drawSensorValues();
      drawOutdoorWeatherCard();
      drawStatusCard();
      delay(500); // หน่วงเวลาป้องกันการแตะซ้ำ
    } else {
      // หากแตะโดนปุ่ม SLEEP มุมขวาล่าง
      if ((screenX >= 200 && screenY >= 180) || (p.x > 2400 && p.y > 2400)) {
        isScreenSleep = true;
        digitalWrite(TFT_BL, LOW); // ดับไฟแบ็คไลท์หน้าจอ 100% มืดสนิทเหมาะสำหรับตอนนอน
        delay(500); // หน่วงเวลาป้องกันการแตะซ้ำ
      }
    }
  }

  // 2. เช็ค WiFi (ถ้าหลุดให้พยายามต่อใหม่)
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWiFiRetry = 0;
    if (millis() - lastWiFiRetry > 10000) {
      lastWiFiRetry = millis();
      if (strlen(WIFI_SSID) > 0) {
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      } else {
        WiFi.reconnect();
      }
    }
  }

  // 3. อัปเดตเวลา (ทุก 1 วินาที)
  if (millis() - lastClockUpdate > 1000) {
    lastClockUpdate = millis();
    drawTime();
  }

  // 4. อ่านค่าเซนเซอร์ SHT30 ในห้อง (ทุก 3 วินาที แม้หน้าจอจะหลับอยู่ก็ยังอ่านตลอดเวลา)
  if (millis() - lastSensorRead > 3000) {
    lastSensorRead = millis();
    readSensorAuto();
    drawSensorValues();
  }

  // 5. ดึงสภาพอากาศปราจีนบุรีจาก Internet (ทุก 10 นาที)
  if (millis() - lastWeatherUpdate > 600000 || lastWeatherUpdate == 0) {
    fetchOutdoorWeather();
    drawOutdoorWeatherCard();
    lastWeatherUpdate = millis();
  }

  // 6. ส่งข้อมูลขึ้น Cloud (ทุก 15 วินาที แม้หน้าจอจะหลับอยู่ก็ยังส่งตามปกติ)
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    if (http.begin(client, serverUrl)) {
      http.addHeader("Content-Type", "application/json");
      
      time_t now; time(&now);
      String json = "{\\"fields\\": {";
      json += "\\"temperature\\": {\\"doubleValue\\": " + String(temp, 1) + "},";
      json += "\\"humidity\\": {\\"doubleValue\\": " + String(humi, 1) + "},";
      json += "\\"sensor_error\\": {\\"booleanValue\\": " + String(isSensorError ? "true" : "false") + "},";
      json += "\\"timestamp\\": {\\"integerValue\\": \\"" + String((unsigned long)now) + "000\\"}";
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

let content = fs.readFileSync('src/App.tsx', 'utf8');
const escapedForJsTemplate = updatedSketch.replace(/\\"/g, '\\\\\\"');

const lightRegex = /const esp32CodeLight = `[\s\S]*?`;/;
const jsonRegex = /const esp32CodeJson = `[\s\S]*?`;/;

content = content.replace(lightRegex, "const esp32CodeLight = `" + escapedForJsTemplate + "`;");
content = content.replace(jsonRegex, "const esp32CodeJson = `" + escapedForJsTemplate + "`;");

fs.writeFileSync('src/App.tsx', content);
console.log('Successfully updated App.tsx with Prachinburi & Sleep mode');
