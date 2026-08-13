import express from 'express';
// Vercel deployment update trigger 7
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, query, limit, where, orderBy } from 'firebase/firestore';
import axios from 'axios';
import firebaseConfig from './firebase-applet-config.json';

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

interface SensorData {
  timestamp: number;
  temperature: number;
  humidity: number;
  sensor_error?: boolean;
}

interface DeviceSettings {
  maxTemp: number;
  maxHum: number;
  sendIntervalSec: number;
  tempOffset?: number;
  humOffset?: number;
  lineToken?: string;
  lineUserId?: string;
  lineNotifyEnabled?: boolean;
  updatedAt: number;
}

let activeSettings: DeviceSettings = {
  maxTemp: 30,
  maxHum: 65,
  sendIntervalSec: 60,
  tempOffset: 0,
  humOffset: 0,
  lineToken: '',
  lineUserId: '',
  lineNotifyEnabled: false,
  updatedAt: Date.now(),
};

// Line Alert State to prevent spam
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown

// Sync settings with Firestore on start
const loadSettings = async () => {
  try {
    const configDoc = await getDoc(doc(db, 'device_settings', 'config'));
    if (configDoc.exists()) {
      activeSettings = { ...activeSettings, ...(configDoc.data() as DeviceSettings) };
      console.log('Loaded device settings from Firestore:', activeSettings);
    } else {
      await setDoc(doc(db, 'device_settings', 'config'), activeSettings);
    }
  } catch (err) {
    console.error('Error loading device settings:', err);
  }
};
loadSettings();

async function checkAndSendAlert(data: SensorData) {
  if (!activeSettings.lineToken) {
    await loadSettings();
  }
  const cleanToken = (activeSettings.lineToken || '').trim();
  const cleanUserId = (activeSettings.lineUserId || '').trim();

  if (!activeSettings.lineNotifyEnabled || !cleanToken || !cleanUserId) return;
  
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) return; // Prevent spam

  const isErr = data.sensor_error || (data.temperature === 0 && data.humidity === 0);
  const isTempHigh = data.temperature > activeSettings.maxTemp;
  const isHumHigh = data.humidity > activeSettings.maxHum;

  let alertMessage = '';

  if (isErr) {
    alertMessage = '⚠️ [แจ้งเตือน] เซนเซอร์มีปัญหา (Sensor Error)\n💡 คำแนะนำ: กรุณาตรวจสอบสายเชื่อมต่อ หรือรีสตาร์ทอุปกรณ์ครับ';
  } else if (isTempHigh && isHumHigh) {
    alertMessage = `🚨 [แจ้งเตือน] อุณหภูมิและความชื้นสูงเกินกำหนดทั้งคู่!\n\n🌡️ อุณหภูมิปัจจุบัน: ${data.temperature.toFixed(1)}°C (เกณฑ์สูงสุด: ${activeSettings.maxTemp}°C)\n💦 ความชื้นปัจจุบัน: ${data.humidity.toFixed(1)}% (เกณฑ์สูงสุด: ${activeSettings.maxHum}%)\n\n💡 คำแนะนำ: ควรเปิดระบบระบายอากาศ และเปิดเครื่องดูดความชื้นครับ`;
  } else if (isTempHigh) {
    alertMessage = `🔥 [แจ้งเตือน] อุณหภูมิสูงเกินกำหนด!\n\n🌡️ อุณหภูมิปัจจุบัน: ${data.temperature.toFixed(1)}°C (เกณฑ์สูงสุด: ${activeSettings.maxTemp}°C)\n💦 ความชื้นปัจจุบัน: ${data.humidity.toFixed(1)}%\n\n💡 คำแนะนำ: ควรเปิดพัดลมระบายอากาศ หรือเปิดเครื่องปรับอากาศเพื่อลดอุณหภูมิครับ`;
  } else if (isHumHigh) {
    alertMessage = `💧 [แจ้งเตือน] ความชื้นสูงเกินกำหนด!\n\n🌡️ อุณหภูมิปัจจุบัน: ${data.temperature.toFixed(1)}°C\n💦 ความชื้นปัจจุบัน: ${data.humidity.toFixed(1)}% (เกณฑ์สูงสุด: ${activeSettings.maxHum}%)\n\n💡 คำแนะนำ: ควรเปิดพัดลมดูดอากาศ หรือใช้เครื่องดูดความชื้นครับ`;
  }

  if (alertMessage) {
    try {
      await axios.post('https://api.line.me/v2/bot/message/push', {
        to: cleanUserId,
        messages: [{ type: 'text', text: alertMessage }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanToken}`
        }
      });
      console.log('Sent LINE OA Alert:', alertMessage);
      lastAlertTime = now;
    } catch (err: any) {
      console.error('Failed to send LINE OA alert:', err?.response?.data || err?.message || err);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.text({ type: '*/*' }));

  // API Route: Get device settings
  app.get('/api/device-config', (req, res) => {
    res.json(activeSettings);
  });

  // API Route: LINE Webhook (Auto-capture Group ID / User ID & Reply Commands)
  app.post('/api/line-webhook', async (req, res) => {
    try {
      await loadSettings();

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      
      if (body && body.events && Array.isArray(body.events)) {
        for (const event of body.events) {
          const cleanToken = (activeSettings.lineToken || '').trim();

          // Auto-save the Group ID or User ID
          let targetId = '';
          if (event.source) {
            if (event.source.type === 'group' && event.source.groupId) {
              targetId = event.source.groupId;
            } else if (event.source.type === 'user' && event.source.userId) {
              targetId = event.source.userId;
            }
          }

          if (targetId && activeSettings.lineUserId !== targetId) {
            activeSettings.lineUserId = targetId;
            activeSettings.updatedAt = Date.now();
            
            try {
              await setDoc(doc(db, 'device_settings', 'config'), activeSettings, { merge: true });
              console.log('Successfully auto-captured LINE Target ID:', targetId);
              
              if (cleanToken) {
                await axios.post('https://api.line.me/v2/bot/message/push', {
                  to: targetId,
                  messages: [{ type: 'text', text: '🟢 สวัสดีครับ! ระบบ Dashboard เชื่อมต่อสำเร็จแล้ว\n\nระบบจะส่งการแจ้งเตือนค่าเซนเซอร์ที่นี่ครับ 📊' }]
                }, {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cleanToken}`
                  }
                });
              }
            } catch (err) {
              console.error('Error saving or replying to LINE Target:', err);
            }
          }

          // Handle text messages for "check", "เช็ค", "status", "สถานะ", etc.
          if (event.type === 'message' && event.message && event.message.type === 'text') {
            const msgText = (event.message.text || '').trim().toLowerCase();
            const isCheckCommand = 
              msgText.includes('check') || 
              msgText.includes('เช็ค') || 
              msgText.includes('เชค') || 
              msgText.includes('status') || 
              msgText.includes('สถานะ') || 
              msgText.includes('อุณหภูมิ') || 
              msgText.includes('ความชื้น') ||
              msgText === 'c';

            if (isCheckCommand) {
              try {
                // Fetch latest sensor data
                const qLatest = query(collection(db, 'sensor_data'), orderBy('timestamp', 'desc'), limit(1));
                const snap = await getDocs(qLatest);
                
                let replyText = '';
                if (!snap.empty) {
                  const latestData = snap.docs[0].data() as SensorData;
                  const isErr = latestData.sensor_error || (latestData.temperature === 0 && latestData.humidity === 0);
                  
                  if (isErr) {
                    replyText = '⚠️ สถานะปัจจุบัน: เซนเซอร์มีปัญหา (Sensor Error)\n💡 คำแนะนำ: กรุณาตรวจสอบสายเชื่อมต่อ หรือรีสตาร์ทอุปกรณ์ครับ';
                  } else {
                    replyText = `📊 สถานะปัจจุบัน:\n🌡️ อุณหภูมิ: ${latestData.temperature.toFixed(1)}°C\n💦 ความชื้น: ${latestData.humidity.toFixed(1)}%`;
                  }
                } else {
                  replyText = '❌ ยังไม่มีข้อมูลเซนเซอร์ในระบบครับ';
                }

                // Reply back using the replyToken
                if (cleanToken && event.replyToken) {
                  await axios.post('https://api.line.me/v2/bot/message/reply', {
                    replyToken: event.replyToken,
                    messages: [{ type: 'text', text: replyText }]
                  }, {
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${cleanToken}`
                    }
                  });
                  console.log('Successfully replied to LINE command:', msgText);
                } else {
                  console.warn('Cannot reply: cleanToken is empty or missing replyToken');
                }
              } catch (err: any) {
                console.error('Error replying to check command:', err?.response?.data || err?.message || err);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Webhook error:', e);
    }

    res.status(200).send('OK');
  });

  // API Route: Update device settings (from Web App)
  app.post('/api/device-config', async (req, res) => {
    const { maxTemp, maxHum, sendIntervalSec, tempOffset, humOffset, lineToken, lineUserId, lineNotifyEnabled } = req.body;
    
    if (maxTemp != null) activeSettings.maxTemp = Number(maxTemp);
    if (maxHum != null) activeSettings.maxHum = Number(maxHum);
    if (sendIntervalSec != null) activeSettings.sendIntervalSec = Number(sendIntervalSec);
    if (tempOffset != null) activeSettings.tempOffset = Number(tempOffset);
    if (humOffset != null) activeSettings.humOffset = Number(humOffset);
    if (lineToken !== undefined) activeSettings.lineToken = lineToken;
    if (lineUserId !== undefined) activeSettings.lineUserId = lineUserId;
    if (lineNotifyEnabled !== undefined) activeSettings.lineNotifyEnabled = Boolean(lineNotifyEnabled);
    
    activeSettings.updatedAt = Date.now();

    try {
      await setDoc(doc(db, 'device_settings', 'config'), activeSettings);
      res.json({ success: true, config: activeSettings });
    } catch (err) {
      console.error('Error updating settings in Firestore:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // API Route: Clear old test sensor data from database
  app.post('/api/clear-sensor-data', async (req, res) => {
    try {
      const q = query(collection(db, 'sensor_data'), limit(500));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'sensor_data', docSnap.id)));
      await Promise.all(deletePromises);
      res.json({ success: true, count: snapshot.docs.length });
    } catch (err) {
      console.error('Error clearing data:', err);
      res.status(500).json({ error: 'Failed to clear data' });
    }
  });

  // API Route: Receive data from ESP32
  app.post('/api/sensor-data', async (req, res) => {
    let bodyData = req.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {
        bodyData = {};
      }
    }

    const temperature = bodyData?.temperature ?? req.query?.temperature;
    const humidity = bodyData?.humidity ?? req.query?.humidity;
    const sensor_error = bodyData?.sensor_error ?? req.query?.sensor_error;
    
    if (temperature == null || humidity == null) {
      res.status(400).json({ error: 'Missing temperature or humidity' });
      return;
    }

    const tempNum = Number(temperature);
    const humNum = Number(humidity);
    const isError = Boolean(sensor_error) || (tempNum === 0 && humNum === 0);


    let rawTs = bodyData?.timestamp || req.query?.timestamp;
    let finalTimestamp = Date.now();
    if (rawTs) {
      const parsedTs = Number(rawTs);
      if (!isNaN(parsedTs) && parsedTs > 0) {
        finalTimestamp = parsedTs < 10000000000 ? parsedTs * 1000 : parsedTs;
      }
    }

    const newData: SensorData = {
      timestamp: finalTimestamp,
      temperature: tempNum,
      humidity: humNum,
      ...(isError ? { sensor_error: true } : {}),
    };

    activeSettings.updatedAt = Date.now();

    try {
      const docRef = await addDoc(collection(db, 'sensor_data'), newData);
      // Also update lastSeen in device_settings so clients receive instant online heartbeat
      await setDoc(doc(db, 'device_settings', 'config'), { ...activeSettings, lastSeen: Date.now() }, { merge: true });

      // Trigger LINE alert if threshold breached
      checkAndSendAlert(newData).catch(err => console.error('Alert error:', err));

      // Return response along with current activeSettings (including fan control state and threshold)
      res.json({ 
        success: true, 
        id: docRef.id, 
        data: newData,
        config: activeSettings
      });
    } catch (err) {
      console.error('Error saving data to Firestore:', err);
      res.status(500).json({ error: 'Failed to save data' });
    }
  });

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // If running on Vercel Serverless, export the app instead of listening
  if (process.env.VERCEL) {
    return app;
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}

// For local/Cloud Run development
const appPromise = startServer();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
