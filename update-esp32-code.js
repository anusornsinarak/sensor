import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The C++ code is in the string assigned to esp32CodeRaw 
// We want to add Serial.println to it to help the user debug.
// But actually, it's easier to just ask the user to look at the screen first.
