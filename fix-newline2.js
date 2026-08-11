import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/Serial\.println\("\\n\\nWiFi Connected!"\);/g, 'Serial.println("\\\\nWiFi Connected!");');
code = code.replace(/Serial\.println\("\\nWiFi Connected!"\);/g, 'Serial.println("\\\\nWiFi Connected!");');

code = code.replace(/Serial\.println\("\\n\\nWiFi Connect Failed\."\);/g, 'Serial.println("\\\\nWiFi Connect Failed.");');
code = code.replace(/Serial\.println\("\\nWiFi Connect Failed\."\);/g, 'Serial.println("\\\\nWiFi Connect Failed.");');

// Also handle literal newlines if they are there
code = code.replace(/Serial\.println\("\\n\nWiFi Connected!"\);/g, 'Serial.println("\\\\nWiFi Connected!");');
code = code.replace(/Serial\.println\("\nWiFi Connected!"\);/g, 'Serial.println("\\\\nWiFi Connected!");');

code = code.replace(/Serial\.println\("\\n\nWiFi Connect Failed\."\);/g, 'Serial.println("\\\\nWiFi Connect Failed.");');
code = code.replace(/Serial\.println\("\nWiFi Connect Failed\."\);/g, 'Serial.println("\\\\nWiFi Connect Failed.");');

fs.writeFileSync('src/App.tsx', code);
