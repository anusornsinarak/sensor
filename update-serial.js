import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace WiFi connection logic with Serial prints
code = code.replace(
  /    WiFi.begin\(WIFI_SSID, WIFI_PASSWORD\);\n    int retry = 0;\n    while \(WiFi.status\(\) != WL_CONNECTED && retry < 30\) {\n      delay\(500\);\n      retry\+\+;\n    }/,
  `    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 30) {
      delay(500);
      Serial.print(".");
      retry++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\\nWiFi Connected!");
      Serial.print("IP: "); Serial.println(WiFi.localIP());
    } else {
      Serial.println("\\nWiFi Connect Failed.");
    }`
);

// Add Serial prints for HTTP
code = code.replace(
  /      lastCloudCode = http.POST\(json\);\n      if \(lastCloudCode == 200\) {/,
  `      Serial.println("Sending Data to Cloud...");
      Serial.println(json);
      lastCloudCode = http.POST(json);
      Serial.print("HTTP Response Code: ");
      Serial.println(lastCloudCode);
      
      if (lastCloudCode == 200) {`
);

// Add error print
code = code.replace(
  /        String res = http.getString\(\);\n      }\n      drawStatusCard\(\);\n      http.end\(\);/,
  `        String res = http.getString();
      } else {
        Serial.print("Error Payload: ");
        Serial.println(http.getString());
      }
      drawStatusCard();
      http.end();`
);

fs.writeFileSync('src/App.tsx', code);
