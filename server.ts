import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, query, limit } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
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
  updatedAt: number;
}

let activeSettings: DeviceSettings = {
  maxTemp: 30,
  maxHum: 65,
  sendIntervalSec: 60,
  tempOffset: 0,
  humOffset: 0,
  updatedAt: Date.now(),
};

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

  // API Route: Update device settings (from Web App)
  app.post('/api/device-config', async (req, res) => {
    const { maxTemp, maxHum, sendIntervalSec, tempOffset, humOffset } = req.body;
    
    if (maxTemp != null) activeSettings.maxTemp = Number(maxTemp);
    if (maxHum != null) activeSettings.maxHum = Number(maxHum);
    if (sendIntervalSec != null) activeSettings.sendIntervalSec = Number(sendIntervalSec);
    if (tempOffset != null) activeSettings.tempOffset = Number(tempOffset);
    if (humOffset != null) activeSettings.humOffset = Number(humOffset);
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

  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
