import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the problematic indexOf parsing code in both esp32CodeLight and esp32CodeJson
const oldPattern = /int idx1 = payload\.indexOf\(\\""lcdLine1""\);[\s\S]*?http\.end\(\);/g;

const cleanCppCode = `int idx1 = payload.indexOf("lcdLine1");
          if (idx1 > 0) {
            int vStart = payload.indexOf("stringValue", idx1);
            if (vStart > 0) {
              int q1 = payload.indexOf('"', vStart + 11);
              int q2 = payload.indexOf('"', q1 + 1);
              if (q1 > 0 && q2 > q1) lcdLine1 = payload.substring(q1 + 1, q2);
            }
          }
          int idx2 = payload.indexOf("lcdLine2");
          if (idx2 > 0) {
            int vStart = payload.indexOf("stringValue", idx2);
            if (vStart > 0) {
              int q1 = payload.indexOf('"', vStart + 11);
              int q2 = payload.indexOf('"', q1 + 1);
              if (q1 > 0 && q2 > q1) lcdLine2 = payload.substring(q1 + 1, q2);
            }
          }
        }
        http.end();`;

// Let's replace any payload.indexOf inside App.tsx with clean logic
content = content.replace(/int idx1 = payload\.indexOf[\s\S]*?http\.end\(\);/g, cleanCppCode);

fs.writeFileSync('src/App.tsx', content);
console.log('App.tsx updated successfully');
