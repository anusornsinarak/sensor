import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<strong>ทางเลือก A \(แนะนำเร็วที่สุด\):<\/strong> เลือกกดแท็บด้านบนแท[\s\S]*?<\/select>\n            <\/div>\n          <\/div>ายถึงอะไร\?<\/h3>/g;

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

if (code.match(regex)) {
  code = code.replace(regex, newStr);
  fs.writeFileSync('src/App.tsx', code);
  console.log("Replaced");
} else {
  console.log("No match found");
}
