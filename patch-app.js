const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const standardsCode = `
export const ROOM_STANDARDS = {
  general: { name: 'ห้องทั่วไป (General)', tempMin: 22, tempMax: 28, humMin: 40, humMax: 60, desc: 'อุณหภูมิห้องทั่วไป' },
  bedroom: { name: 'ห้องนอน (Bedroom)', tempMin: 20, tempMax: 25, humMin: 40, humMax: 60, desc: 'เหมาะกับการนอนหลับ' },
  server_room: { name: 'ห้องเซิร์ฟเวอร์ (Server)', tempMin: 18, tempMax: 24, humMin: 40, humMax: 55, desc: 'ป้องกันความร้อนสะสม' },
  greenhouse: { name: 'โรงเรือนปลูกพืช (Greenhouse)', tempMin: 20, tempMax: 30, humMin: 50, humMax: 80, desc: 'ความชื้นสูงสำหรับพืช' },
  baby_room: { name: 'ห้องเด็กอ่อน (Baby)', tempMin: 22, tempMax: 24, humMin: 40, humMax: 60, desc: 'ควบคุมอุณหภูมิคงที่' },
};
type RoomType = keyof typeof ROOM_STANDARDS;
`;

if (!code.includes('ROOM_STANDARDS')) {
  code = code.replace('// Initialize Firebase', standardsCode + '\n// Initialize Firebase');
}

fs.writeFileSync('src/App.tsx', code);
