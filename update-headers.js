import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

const oldHeader = `#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>`;

const newHeader = `#include <functional>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>`;

content = content.replaceAll(oldHeader, newHeader);

fs.writeFileSync('src/App.tsx', content);
console.log('Headers updated in App.tsx');
