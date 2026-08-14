import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add variables to esp32CodeLight and esp32CodeJson
const varStr = `// --- 3. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
unsigned long lastSend = 0;
unsigned long lastTimeUpdate = 0;
const int sendIntervalSec = 30;
int currentShtAddress = 0;
String lcdLine1 = "WAITING DATA...";
String lcdLine2 = "CONNECTING...";`;

content = content.replace(/\/\/ --- 3\. ตัวแปรสถานะระบบ ---\nfloat temp = 0, humi = 0;\nbool isSensorError = true;\nint lastCloudCode = 0;\nunsigned long lastSend = 0;\nunsigned long lastTimeUpdate = 0;\nconst int sendIntervalSec = 30;\nint currentShtAddress = 0;/g, varStr);

// 2. Add config fetch logic inside scanAndReadSensor loop
const fetchCodeLight = `        http.end();
      }

      // Fetch Display Config
      String configUrl = String(serverUrl);
      configUrl.replace("sensor_data", "device_settings/config");
      if (http.begin(client, configUrl)) {
        int code = http.GET();
        if (code == 200) {
          String payload = http.getString();
          int idx1 = payload.indexOf("\\"lcdLine1\\":");
          if (idx1 > 0) {
             int start1 = payload.indexOf("\\"stringValue\\": \\"", idx1) + 16;
             int end1 = payload.indexOf("\\"", start1);
             lcdLine1 = payload.substring(start1, end1);
          }
          int idx2 = payload.indexOf("\\"lcdLine2\\":");
          if (idx2 > 0) {
             int start2 = payload.indexOf("\\"stringValue\\": \\"", idx2) + 16;
             int end2 = payload.indexOf("\\"", start2);
             lcdLine2 = payload.substring(start2, end2);
          }
        }
        http.end();
      }`;

const fetchCodeJson = `        http.end();
      }

      // Fetch Display Config
      String configUrl = String(serverUrl);
      configUrl.replace("sensor_data", "device_settings/config");
      if (http.begin(client, configUrl)) {
        int code = http.GET();
        if (code == 200) {
          String payload = http.getString();
          DynamicJsonDocument doc(2048);
          deserializeJson(doc, payload);
          if (doc["fields"]["lcdLine1"]["stringValue"]) lcdLine1 = doc["fields"]["lcdLine1"]["stringValue"].as<String>();
          if (doc["fields"]["lcdLine2"]["stringValue"]) lcdLine2 = doc["fields"]["lcdLine2"]["stringValue"].as<String>();
        }
        http.end();
      }`;

// Since the loop is the same for both, and we have two variables `esp32CodeLight` and `esp32CodeJson`, 
// we can just replace both. Wait, esp32CodeJson might not be what I think it is. Let's just use the manual parser for both, it's safer.
const fetchCodeBoth = `        http.end();
      }

      // Fetch Display Config
      String configUrl = String(serverUrl);
      configUrl.replace("sensor_data", "device_settings/config");
      if (http.begin(client, configUrl)) {
        int code = http.GET();
        if (code == 200) {
          String payload = http.getString();
          int idx1 = payload.indexOf("\\"lcdLine1\\"");
          if (idx1 > 0) {
             int start1 = payload.indexOf("\\"stringValue\\": \\"", idx1) + 16;
             if (start1 > 16) {
               int end1 = payload.indexOf("\\"", start1);
               if (end1 > start1) lcdLine1 = payload.substring(start1, end1);
             }
          }
          int idx2 = payload.indexOf("\\"lcdLine2\\"");
          if (idx2 > 0) {
             int start2 = payload.indexOf("\\"stringValue\\": \\"", idx2) + 16;
             if (start2 > 16) {
               int end2 = payload.indexOf("\\"", start2);
               if (end2 > start2) lcdLine2 = payload.substring(start2, end2);
             }
          }
        }
        http.end();
      }`;

content = content.replace(/        http\.end\(\);\n      }\n    }\n    \n    drawStatusCard\(\);/g, fetchCodeBoth + '\n    }\n    \n    drawStatusCard();');

// 3. Update drawStatusCard
const drawStatusOld = `  // --- Bottom Status Bar (Left side) ---
  tft.fillRect(0, 205, 225, 35, tft.color565(15, 15, 15));
  tft.setTextColor(TFT_LIGHTGREY, tft.color565(15, 15, 15));
  tft.setTextDatum(ML_DATUM);
  
  String ipStr = "IP: " + WiFi.localIP().toString();
  String codeStr = "HTTP: " + String(lastCloudCode);
  tft.drawString(ipStr, 5, 215, 1);
  tft.drawString(codeStr, 5, 228, 1);`;

const drawStatusNew = `  // --- Bottom Status Bar (Left side) ---
  tft.fillRect(0, 205, 320, 35, tft.color565(15, 15, 15));
  tft.setTextColor(TFT_GREEN, tft.color565(15, 15, 15));
  tft.setTextDatum(ML_DATUM);
  tft.drawString(lcdLine1, 5, 215, 2);
  tft.setTextColor(TFT_LIGHTGREY, tft.color565(15, 15, 15));
  tft.drawString(lcdLine2, 5, 230, 1);`;

content = content.replace(drawStatusOld, drawStatusNew);
content = content.replace(drawStatusOld, drawStatusNew);

fs.writeFileSync('src/App.tsx', content);
