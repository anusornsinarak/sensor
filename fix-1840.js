import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldStr = `<strong>ทางเลือก A (แนะนำเร็วที่สุด):</strong> เลือกกดแท็บด้านบนแท          {/* Interval Setting Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" /> ตั้งค่าระบบ (Settings)
              </h2>
              {isUpdatingConfig && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
            </div>
              
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">รอบการส่งข้อมูล</span>
              </div>
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
          </div>ายถึงอะไร?</h3>`;

const newStr = `<strong>ทางเลือก A (แนะนำเร็วที่สุด):</strong> เลือกกดแท็บด้านบนแท็บ <strong>"2. โค้ดแบบไม่ใช้ Library"</strong> แล้วคัดลอกโค้ดไปวางทับใหม่ให้ครบถ้วนครับ
                          </li>
                          <li>
                            <strong>ทางเลือก B:</strong> หากต้องการใช้แท็บ 3 คุณต้องไปที่เมนู <strong>Sketch {'>'} Include Library {'>'} Manage Libraries...</strong> ค้นหา <strong>"ArduinoJson"</strong> แล้วกด Install (เวอร์ชัน 7.x) ให้เรียบร้อยก่อนกด Upload ครับ
                          </li>
                        </ol>
                      </div>
                    </div>

                    {/* Fix Error 2: String Literal Error */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-orange-900 text-base">Error: "unable to find string literal operator" หมายถึงอะไร?</h3>`;

code = code.replace(oldStr, newStr);
fs.writeFileSync('src/App.tsx', code);
