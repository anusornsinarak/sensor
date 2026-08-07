import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

interface SensorData {
  timestamp: number;
  temperature: number;
  humidity: number;
}

// Optionally seed initial data if empty
const seedData = async () => {
  try {
    const q = query(collection(db, 'sensor_data'), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log('Seeding initial data to Firestore...');
      const now = Date.now();
      let baseTemp = 25;
      let baseHum = 50;
      for (let i = 60; i >= 0; i--) {
        baseTemp = baseTemp + (Math.random() - 0.5) * 1.5;
        baseHum = baseHum + (Math.random() - 0.5) * 3;
        await addDoc(collection(db, 'sensor_data'), {
          timestamp: now - i * 60000,
          temperature: Number(baseTemp.toFixed(1)),
          humidity: Number(baseHum.toFixed(1)),
        });
      }
      console.log('Seeding complete.');
    }
  } catch (err) {
    console.error('Error seeding data:', err);
  }
};
seedData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Receive data from ESP32
  app.post('/api/sensor-data', async (req, res) => {
    const { temperature, humidity } = req.body;
    
    if (temperature == null || humidity == null) {
      res.status(400).json({ error: 'Missing temperature or humidity' });
      return;
    }

    const newData: SensorData = {
      timestamp: Date.now(),
      temperature: Number(temperature),
      humidity: Number(humidity),
    };

    try {
      const docRef = await addDoc(collection(db, 'sensor_data'), newData);
      res.json({ success: true, id: docRef.id, data: newData });
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
