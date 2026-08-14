import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Fix touch.begin(touchSpi) in setup
content = content.replaceAll("touch.begin();", "touch.begin(touchSpi);");

// 2. Fix drawStatusCard to properly keep WIFI CFG button and render lcdLine1 & lcdLine2
const oldDrawStatus = `void drawStatusCard() {
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
  tft.fillRect(0, 205, 320, 35, tft.color565(15, 15, 15));
  tft.setTextColor(TFT_GREEN, tft.color565(15, 15, 15));
  tft.setTextDatum(ML_DATUM);
  tft.drawString(lcdLine1, 5, 215, 2);
  tft.setTextColor(TFT_LIGHTGREY, tft.color565(15, 15, 15));
  tft.drawString(lcdLine2, 5, 230, 1);
}`;

const newDrawStatus = `void drawStatusCard() {
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
  
  // --- Bottom Status Bar (Left side 220px) ---
  tft.fillRect(0, 205, 222, 35, tft.color565(15, 15, 15));
  tft.setTextColor(TFT_GREEN, tft.color565(15, 15, 15));
  tft.setTextDatum(ML_DATUM);
  tft.drawString(lcdLine1, 5, 215, 2);
  tft.setTextColor(TFT_LIGHTGREY, tft.color565(15, 15, 15));
  tft.drawString(lcdLine2, 5, 230, 1);

  // Redraw WiFi Button so it is never overwritten
  tft.fillRoundRect(228, 208, 88, 28, 4, tft.color565(255, 180, 0));
  tft.setTextColor(TFT_BLACK, tft.color565(255, 180, 0));
  tft.setTextDatum(MC_DATUM);
  tft.drawString("WIFI CFG", 272, 222, 2);
}`;

content = content.replaceAll(oldDrawStatus, newDrawStatus);

// 3. Fix checkTouch calibration and sensitivity
const oldCheckTouch = `void checkTouch() {
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
}`;

const newCheckTouch = `void checkTouch() {
  if (touch.touched() || touch.tirqTouched()) {
    TS_Point p = touch.getPoint();
    // CYD Touch calibration for Landscape (320x240)
    int touchX = map(p.x, 200, 3800, 0, 320);
    int touchY = map(p.y, 240, 3800, 0, 240);
    
    // Check if touched bottom-right corner (WIFI CFG button)
    if ((touchX >= 210 && touchY >= 190) || (p.x > 2500 && p.y > 2500)) {
      tft.fillScreen(TFT_BLACK);
      tft.setTextColor(TFT_YELLOW, TFT_BLACK);
      tft.setTextDatum(MC_DATUM);
      tft.drawString("Resetting WiFi...", 160, 100, 4);
      tft.drawString("Opening Config Portal...", 160, 140, 2);
      delay(1200);
      WiFiManager wm;
      wm.resetSettings();
      ESP.restart();
    }
  }
}`;

content = content.replaceAll(oldCheckTouch, newCheckTouch);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated with touch and display fixes');
