import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/sensor_data?key=${config.apiKey}`;

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the endpoint
code = code.replace(/const char\* serverUrl = "\$\{serverUrlEndpoint\}";/g, `const char* serverUrl = "${FIREBASE_URL}";`);

// Replace the JSON payload
const oldJson = `      String json = "{";
      json += "\\\\"temperature\\\\":" + String(temp, 1) + ",";
      json += "\\\\"humidity\\\\":" + String(humi, 1) + ",";
      json += "\\\\"sensor_error\\\\":" + String(isSensorError ? "true" : "false");
      json += "}";`;

const newJson = `      time_t now;
      time(&now);
      String json = "{";
      json += "\\\\"fields\\\\": {";
      json += "\\\\"temperature\\\\": {\\\\"doubleValue\\\\": " + String(temp, 1) + "},";
      json += "\\\\"humidity\\\\": {\\\\"doubleValue\\\\": " + String(humi, 1) + "},";
      json += "\\\\"sensor_error\\\\": {\\\\"booleanValue\\\\": " + String(isSensorError ? "true" : "false") + "},";
      json += "\\\\"timestamp\\\\": {\\\\"integerValue\\\\": \\\\"" + String((unsigned long)now) + "000\\\\"}";
      json += "}}";`;

code = code.replace(oldJson, newJson);
code = code.replace(oldJson, newJson); // replace twice for both versions if applicable

fs.writeFileSync('src/App.tsx', code);
