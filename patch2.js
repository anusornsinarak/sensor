import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Also replace the parsing logic in Tab 2, ensuring correct backslash escaping for C++ strings in JSX
const oldParsing = `        if (res.indexOf("\\"fanState\\":true") >= 0) {
          fanState = true;
        } else if (res.indexOf("\\"fanState\\":false") >= 0) {
          fanState = false;
        }

        if (res.indexOf("\\"autoFan\\":true") >= 0) {
          autoFan = true;
        } else if (res.indexOf("\\"autoFan\\":false") >= 0) {
          autoFan = false;
        }`;

const newParsing = `        if (res.indexOf("\\\\\\"fanState\\\\\\":true") >= 0) {
          fanState = true;
        } else if (res.indexOf("\\\\\\"fanState\\\\\\":false") >= 0) {
          fanState = false;
        }

        if (res.indexOf("\\\\\\"autoFan\\\\\\":true") >= 0) {
          autoFan = true;
        } else if (res.indexOf("\\\\\\"autoFan\\\\\\":false") >= 0) {
          autoFan = false;
        }`;

code = code.replace(oldParsing, newParsing);

const oldJson = `      String json = "{";
      json += "\\"temperature\\":" + String(temp, 1) + ",";
      json += "\\"humidity\\":" + String(humi, 1) + ",";
      json += "\\"sensor_error\\":" + String(isSensorError ? "true" : "false");
      json += "}";`;

const newJson = `      String json = "{";
      json += "\\\\\\"temperature\\\\\\":" + String(temp, 1) + ",";
      json += "\\\\\\"humidity\\\\\\":" + String(humi, 1) + ",";
      json += "\\\\\\"sensor_error\\\\\\":" + String(isSensorError ? "true" : "false");
      json += "}";`;

code = code.replace(oldJson, newJson);

fs.writeFileSync('src/App.tsx', code);
