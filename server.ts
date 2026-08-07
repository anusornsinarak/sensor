import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Store sensor data in memory (max 1000 records)
interface SensorData {
  id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
}
const sensorData: SensorData[] = [];

// Seed initial data for demonstration purposes
const seedData = () => {
  const now = Date.now();
  let baseTemp = 25;
  let baseHum = 50;
  for (let i = 60; i >= 0; i--) {
    baseTemp = baseTemp + (Math.random() - 0.5) * 1.5;
    baseHum = baseHum + (Math.random() - 0.5) * 3;
    sensorData.push({
      id: Math.random().toString(36).substring(7),
      timestamp: now - i * 60000, // Every minute for the last hour
      temperature: Number(baseTemp.toFixed(1)),
      humidity: Number(baseHum.toFixed(1)),
    });
  }
};
seedData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON bodies (for ESP32 POST requests)
  app.use(express.json());

  // API Route: Get all data
  app.get('/api/sensor-data', (req, res) => {
    res.json(sensorData);
  });

  // API Route: Receive data from ESP32
  app.post('/api/sensor-data', (req, res) => {
    const { temperature, humidity } = req.body;
    
    if (temperature == null || humidity == null) {
      res.status(400).json({ error: 'Missing temperature or humidity' });
      return;
    }

    const newData: SensorData = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      temperature: Number(temperature),
      humidity: Number(humidity),
    };

    sensorData.push(newData);

    // Keep only the latest 1000 records to prevent memory issues
    if (sensorData.length > 1000) {
      sensorData.shift();
    }

    res.json({ success: true, data: newData });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
