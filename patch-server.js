import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// Remove fanState and autoFan from DeviceSettings interface
code = code.replace(/  fanState: boolean;\n  autoFan: boolean;\n/g, '');
code = code.replace(/  fanState: false,\n  autoFan: true,\n/g, '');

// Remove from POST /api/device-config
code = code.replace(/, fanState, autoFan /g, ' ');
code = code.replace(/    if \(fanState != null\) activeSettings.fanState = Boolean\(fanState\);\n    if \(autoFan != null\) activeSettings.autoFan = Boolean\(autoFan\);\n/g, '');

// Remove auto fan logic in POST /api/sensor-data
const autoFanLogic = `    // Auto fan control logic if enabled
    if (activeSettings.autoFan && !isError) {
      if (tempNum > activeSettings.maxTemp || humNum > activeSettings.maxHum) {
        activeSettings.fanState = true;
      } else {
        activeSettings.fanState = false;
      }
    }
`;
code = code.replace(autoFanLogic, '');

fs.writeFileSync('server.ts', code);
