import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/Serial.println\("\\n\nWiFi Connected!"\);/g, 'Serial.println("\\\\nWiFi Connected!");');
code = code.replace(/Serial.println\("\\n\nWiFi Connect Failed."\);/g, 'Serial.println("\\\\nWiFi Connect Failed.");');

fs.writeFileSync('src/App.tsx', code);
