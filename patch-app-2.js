import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Fix remaining settings defaults
code = code.replace(/    fanState: false,\n    autoFan: true,\n/g, '');

// Fix C++ fanState declaration
code = code.replace(/bool fanState = false;\n/g, '');

// Fix remaining fanState parsing
code = code.replace(/        if \(res.indexOf\("\\"fanState\\":true"\) >= 0\) {\n          fanState = true;\n        } else if \(res.indexOf\("\\"fanState\\":false"\) >= 0\) {\n          fanState = false;\n        }\n/g, '');

// Remove the remaining React UI for Fan
const reactUIRemoval = `                  <div>
                    <p className="text-xs font-bold text-slate-800">พัดลม / Cooler (Relay Pin 22)</p>
                    <p className="text-[10px] text-slate-500">{settings.fanState ? 'กำลังทำงาน (ACTIVE)' : 'ปิดการทำงาน (OFF)'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-2">
                <span className="text-xs text-slate-600 font-medium">โหมดคำสั่ง</span>
                <button
                  onClick={() => updateDeviceConfig({ fanState: !settings.fanState })}
                  className={\`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer \${
                    settings.fanState ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-800 text-white hover:bg-slate-700'
                  }\`}
                >
                  {settings.fanState ? 'สวิตช์: กดเพื่อสั่งปิด' : 'สวิตช์: กดเพื่อสั่งเปิด'}
                </button>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-slate-500">ควบคุมอุณหภูมิอัตโนมัติ (Auto Fan)</span>
                <input 
                  type="checkbox" 
                  checked={settings.autoFan} 
                  onChange={(e) => updateDeviceConfig({ autoFan: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </div>`;
code = code.replace(reactUIRemoval, '');

// Remove remaining pieces of the card
code = code.replace(/          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">\n            <div className="flex items-center justify-between">\n              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">\n                <Power className="w-4 h-4 text-blue-600" \/> สั่งการอุปกรณ์ \(Remote Control\)\n              <\/h2>\n              \{isUpdatingConfig && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" \/>\}\n            <\/div>\n\n\n\n            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">\n/g, 
`          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
`);

fs.writeFileSync('src/App.tsx', code);
