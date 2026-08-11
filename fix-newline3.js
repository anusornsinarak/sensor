import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// I also added Serial debugs to Tab 3 code earlier, let me check if Tab 3 is broken too.
// Wait, I only added Serial debugs using regex. The regex might have hit Tab 3 as well if it matched. 
// Tab 3 had `if (lastCloudCode == 200)` as well. 
// I'll run the same fix-newline3 script just to be sure it replaces ANY bad newlines in the entire string.
code = code.replace(/Serial\.println\("\\n\n/g, 'Serial.println("\\\\n');
code = code.replace(/Serial\.println\("\n/g, 'Serial.println("\\\\n');

fs.writeFileSync('src/App.tsx', code);
