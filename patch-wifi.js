import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace hardcoded WIFI_SSID and WIFI_PASSWORD with empty strings
code = code.replace(/const char\* WIFI_SSID = "Mai_home_2.4G";/g, 'const char* WIFI_SSID = "";');
code = code.replace(/const char\* WIFI_PASSWORD = "0909142651";/g, 'const char* WIFI_PASSWORD = "";');

fs.writeFileSync('src/App.tsx', code);
