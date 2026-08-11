import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/sensor_data?key=${config.apiKey}`;

let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const char\* serverUrl = "\$\{serverUrlEndpoint\}";/g, `const char* serverUrl = "${FIREBASE_URL}";`);

// find the exact lines
let lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('String json = "{";') && lines[i+1].includes('temperature') && lines[i+2].includes('humidity')) {
    lines[i] = `      time_t now; time(&now);`;
    lines[i+1] = `      String json = "{";`;
    lines[i+2] = `      json += "\\\\"fields\\\\": {";`;
    lines[i+3] = `      json += "\\\\"temperature\\\\": {\\\\"doubleValue\\\\": " + String(temp, 1) + "},";`;
    // shift everything else out
    lines[i+4] = `      json += "\\\\"humidity\\\\": {\\\\"doubleValue\\\\": " + String(humi, 1) + "},";`;
    lines.splice(i+5, 0, `      json += "\\\\"sensor_error\\\\": {\\\\"booleanValue\\\\": " + String(isSensorError ? "true" : "false") + "},";`);
    lines.splice(i+6, 0, `      json += "\\\\"timestamp\\\\": {\\\\"integerValue\\\\": \\\\"" + String((unsigned long)now) + "000\\\\"}";`);
    lines.splice(i+7, 0, `      json += "}}";`);
  }
}

fs.writeFileSync('src/App.tsx', lines.join('\n'));
