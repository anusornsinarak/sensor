import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove from DeviceSettings interface and defaults
code = code.replace(/  fanState: boolean;\n  autoFan: boolean;\n/g, '');
code = code.replace(/  fanState: false,\n  autoFan: true,\n/g, '');

// 2. Remove from C++ strings (Tab 2)
code = code.replace(/bool fanState = false;\nbool autoFan = true;\n/g, '');
code = code.replace(/#define RELAY_PIN     22  \/\/ ขาควบคุม Relay พัดลม \(หรือ Pin 4 LED\)\n/g, '');
code = code.replace(/    if \(pin == RELAY_PIN && fanState\) continue;\n/g, '');
code = code.replace(/void updateHardware\(\) {\n  digitalWrite\(RELAY_PIN, fanState \? HIGH : LOW\);\n}\n/g, '');
code = code.replace(/  pinMode\(RELAY_PIN, OUTPUT\);\n  digitalWrite\(RELAY_PIN, LOW\);\n/g, '');

// Remove fan button drawing
code = code.replace(/  uint16_t fanBtnColor = fanState \? tft.color565\(16, 185, 129\) : COLOR_CARD_BG;\n  tft.fillRoundRect\(216, 190, 98, 42, 8, fanBtnColor\);\n  tft.drawRoundRect\(216, 190, 98, 42, 8, fanState \? TFT_GREEN : COLOR_CARD_LINE\);\n  tft.setTextColor\(TFT_WHITE, fanBtnColor\);\n  tft.drawCentreString\(fanState \? "\[ FAN:ON \]" : "\[ FAN:OFF \]", 265, 202, 2\);\n/g, '');

// Remove fan touch logic
code = code.replace(/      } else if \(screenX >= 210\) {\n        fanState = !fanState;\n        updateHardware\(\);\n        drawUI\(\);\n        delay\(300\);\n/g, '');

// Remove updateHardware() calls
code = code.replace(/        updateHardware\(\);\n/g, '');

// Remove HTTP fanState parsing (Tab 2)
code = code.replace(/        if \(res.indexOf\("\\\\\\"fanState\\\\\\":true"\) >= 0\) {\n          fanState = true;\n        } else if \(res.indexOf\("\\\\\\"fanState\\\\\\":false"\) >= 0\) {\n          fanState = false;\n        }\n\n        if \(res.indexOf\("\\\\\\"autoFan\\\\\\":true"\) >= 0\) {\n          autoFan = true;\n        } else if \(res.indexOf\("\\\\\\"autoFan\\\\\\":false"\) >= 0\) {\n          autoFan = false;\n        }\n/g, '');
// Fallback if it was older version
code = code.replace(/        if \(res.indexOf\("\"fanState\":true"\) >= 0\) {\n          fanState = true;\n        } else if \(res.indexOf\("\"fanState\":false"\) >= 0\) {\n          fanState = false;\n        }\n/g, '');

// Remove HTTP fanState parsing (Tab 3)
code = code.replace(/          fanState = cfg\["fanState"\] \| fanState;\n          autoFan = cfg\["autoFan"\] \| autoFan;\n/g, '');

// Fix missing end bracket on screenX touch check
code = code.replace(/      } else if \(screenX >= 105 && screenX < 210\) {\n        WiFiManager wm; wm.resetSettings\(\); ESP.restart\(\);\n      }\n    }\n  }\n/g, 
`      } else if (screenX >= 105) {
        WiFiManager wm; wm.resetSettings(); ESP.restart();
      }
    }
  }
`);

// 3. Remove React UI components
// Desktop Fan control:
code = code.replace(/            \{\/\* Fan \/ Cooler Switch \*\/\}\n            <div className=\{`p-4 rounded-xl border transition-all \$\{[\s\S]*?            <\/div>\n/g, '');
// Mobile Fan control:
code = code.replace(/            \{\/\* Mobile Remote Fan Toggle \*\/\}\n            <div className="flex items-center justify-between p-2\.5 bg-slate-50 rounded-xl border border-slate-200">[\s\S]*?            <\/div>\n/g, '');

// Adjust text in error message
code = code.replace(/และ <code className="bg-red-100 text-red-900 px-1 rounded font-mono">bool fanState = false;<\/code> /g, '');

fs.writeFileSync('src/App.tsx', code);
