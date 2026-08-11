import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /          \{\/\* Remote Hardware Control Card \*\/\}\n          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">\n            <div className="flex items-center justify-between">\n              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">\n                <Power className="w-4 h-4 text-blue-600" \/> สั่งการอุปกรณ์ \(Remote Control\)\n              <\/h2>\n              \{isUpdatingConfig && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" \/>\}\n            <\/div>\n\n            <\/div>\n\n            \{\/\* Interval Setting \*\/\}\n            <div className="p-3 bg-blue-50\/50 rounded-xl border border-blue-100 flex items-center justify-between">\n              <div className="flex items-center gap-2">\n                <Clock className="w-4 h-4 text-blue-600" \/>\n                <span className="text-xs font-semibold text-slate-700">รอบการส่งข้อมูล<\/span>\n              <\/div>\n              <select \n                value=\{settings.sendIntervalSec\}\n                onChange=\{\(e\) => updateDeviceConfig\(\{ sendIntervalSec: Number\(e.target.value\) \}\)\}\n                className="text-xs font-bold text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded-md outline-none cursor-pointer"\n              >\n                <option value=\{30\}>ทุก 30s<\/option>\n                <option value=\{60\}>ทุก 1 นาที<\/option>\n                <option value=\{120\}>ทุก 2 นาที<\/option>\n                <option value=\{300\}>ทุก 5 นาที<\/option>\n              <\/select>\n            <\/div>\n          <\/div>/g;

const replacement = `          {/* Interval Setting */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" /> ตั้งค่าระบบ (Settings)
              </h2>
              {isUpdatingConfig && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">รอบการส่งข้อมูล</span>
              <select 
                value={settings.sendIntervalSec}
                onChange={(e) => updateDeviceConfig({ sendIntervalSec: Number(e.target.value) })}
                className="text-xs font-bold text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded-md outline-none cursor-pointer"
              >
                <option value={30}>ทุก 30s</option>
                <option value={60}>ทุก 1 นาที</option>
                <option value={120}>ทุก 2 นาที</option>
                <option value={300}>ทุก 5 นาที</option>
              </select>
            </div>
          </div>`;

code = code.replace(regex, replacement);

fs.writeFileSync('src/App.tsx', code);
