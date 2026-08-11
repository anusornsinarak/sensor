import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Find the modal description text to add info about the new UI
const oldText = '✨ หน้าจอดีไซน์ใหม่ ตัวเลขใหญ่ คมชัด อ่านง่าย + แสดงวัน/เวลาปัจจุบันอัตโนมัติ';
const newText = '✨ หน้าจอใหม่: อุณหภูมิ/ความชื้นใหญ่พิเศษ + ตั้งเวลาอัตโนมัติ + มีปุ่มกด [WIFI CFG] บนจอเพื่อเปลี่ยน WiFi';
code = code.replace(oldText, newText);

fs.writeFileSync('src/App.tsx', code);
