import fs from 'fs';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/sensor_data?key=${config.apiKey}`;

let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the dynamic serverUrlEndpoint with the direct Firestore URL
// Actually, I'll just change the C++ code generation in App.tsx.

// 1. In esp32CodeRaw and esp32CodeLight, replace:
// const char* serverUrl = "${serverUrlEndpoint}";
// with the Firebase URL.

code = code.replace(/const char\* serverUrl = "\$\{serverUrlEndpoint\}";/g, `const char* serverUrl = "${FIREBASE_URL}";`);

// 2. Change the JSON payload construction in both C++ codes.
const jsonPayloadRegex = /String json = "\\{";\s*json \+= "\\\\"temperature\\\\":.*?;\s*json \+= "\\\\"humidity\\\\":.*?;\s*json \+= "\\\\"sensor_error\\\\":.*?;\s*json \+= "\\}";/sg;

const newJsonPayload = `time_t now;
      time(&now);
      unsigned long long epochMs = (unsigned long long)now * 1000ULL;
      
      String json = "{";
      json += "\\\"fields\\\": {";
      json += "\\\"temperature\\\": {\\\"doubleValue\\\": " + String(temp, 1) + "},";
      json += "\\\"humidity\\\": {\\\"doubleValue\\\": " + String(humi, 1) + "},";
      json += "\\\"sensor_error\\\": {\\\"booleanValue\\\": " + String(isSensorError ? "true" : "false") + "},";
      json += "\\\"timestamp\\\": {\\\"integerValue\\\": \\\"" + String((unsigned long)now) + "000\\\"}";
      json += "}}";`;

code = code.replace(jsonPayloadRegex, newJsonPayload);

// We should also replace the string version that doesn't have double escaping (if any)
const jsonPayloadRegex2 = /String json = "\{";\s*json \+= "\\"temperature\\":.*?;\s*json \+= "\\"humidity\\":.*?;\s*json \+= "\\"sensor_error\\":.*?;\s*json \+= "\}";/sg;
const newJsonPayload2 = `time_t now;
      time(&now);
      
      String json = "{";
      json += "\\"fields\\": {";
      json += "\\"temperature\\": {\\"doubleValue\\": " + String(temp, 1) + "},";
      json += "\\"humidity\\": {\\"doubleValue\\": " + String(humi, 1) + "},";
      json += "\\"sensor_error\\": {\\"booleanValue\\": " + String(isSensorError ? "true" : "false") + "},";
      json += "\\"timestamp\\": {\\"integerValue\\": \\"" + String((unsigned long)now) + "000\\"}";
      json += "}}";`;
      
code = code.replace(jsonPayloadRegex2, newJsonPayload2);

fs.writeFileSync('src/App.tsx', code);
console.log('Done modifying C++ code for Firestore Direct REST API.');
