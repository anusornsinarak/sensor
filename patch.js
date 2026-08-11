import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `// 3. ฟังก์ชันอัปเดตการ์ดสถานะ Cloud & Alert
void drawStatusCard() {
  tft.fillRect(10, 138, 300, 44, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  String cloudText = "Cloud: " + String(lastCloudCode == 200 ? "Synced (200 OK)" : (lastCloudCode == 0 ? "Connecting..." : "Error " + String(lastCloudCode)));
  tft.drawString(cloudText, 14, 142, 2);

  tft.setTextColor(isSensorError ? TFT_RED : TFT_GREEN, COLOR_CARD_BG);
  tft.drawString(isSensorError ? "STATUS: SENSOR ERR" : "STATUS: NORMAL", 14, 162, 2);

  struct tm timeinfo;
  char timeStr[10] = "--:--";
  if (getLocalTime(&timeinfo)) strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
  tft.setTextColor(COLOR_MUTED, COLOR_CARD_BG);
  tft.drawString("Last Sync: " + String(timeStr), 180, 162, 2);
}`;

const replacement = `// 3. ฟังก์ชันอัปเดตการ์ดสถานะ Cloud & Alert
void drawStatusCard() {
  tft.fillRect(10, 138, 300, 44, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  String cloudText = "Cloud: " + String(lastCloudCode == 200 ? "Synced (200 OK)" : (lastCloudCode == 0 ? "Connecting..." : "Error " + String(lastCloudCode)));
  tft.drawString(cloudText, 14, 142, 2);

  tft.setTextColor(isSensorError ? TFT_RED : TFT_GREEN, COLOR_CARD_BG);
  tft.drawString(isSensorError ? "STATUS: SENSOR ERR" : "STATUS: NORMAL", 14, 162, 2);

  tft.setTextColor(COLOR_MUTED, COLOR_CARD_BG);
  tft.drawString("Last OK: " + lastSyncOK + "  ", 180, 162, 2);
}`;

code = code.split(target).join(replacement);
fs.writeFileSync('src/App.tsx', code);
