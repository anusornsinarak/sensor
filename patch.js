import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the invalid string literal concatenation in Tab 2
const oldCode = `      String json = "{";
      json += """temperature":"" + String(temp, 1) + ",";
      json += """humidity":"" + String(humi, 1) + ",";
      json += """sensor_error":"" + String(isSensorError ? "true" : "false");
      json += "}";`;

const newCode = `      String json = "{";
      json += "\\"temperature\\":" + String(temp, 1) + ",";
      json += "\\"humidity\\":" + String(humi, 1) + ",";
      json += "\\"sensor_error\\":" + String(isSensorError ? "true" : "false");
      json += "}";`;

code = code.replace(oldCode, newCode);

// Also replace the parsing logic in Tab 2
const oldParsing = `        if (res.indexOf("""fanState":true") >= 0) {
          fanState = true;
        } else if (res.indexOf("""fanState":false") >= 0) {
          fanState = false;
        }

        if (res.indexOf("""autoFan":true") >= 0) {
          autoFan = true;
        } else if (res.indexOf("""autoFan":false") >= 0) {
          autoFan = false;
        }`;

const newParsing = `        if (res.indexOf("\\"fanState\\":true") >= 0) {
          fanState = true;
        } else if (res.indexOf("\\"fanState\\":false") >= 0) {
          fanState = false;
        }

        if (res.indexOf("\\"autoFan\\":true") >= 0) {
          autoFan = true;
        } else if (res.indexOf("\\"autoFan\\":false") >= 0) {
          autoFan = false;
        }`;

code = code.replace(oldParsing, newParsing);

fs.writeFileSync('src/App.tsx', code);
