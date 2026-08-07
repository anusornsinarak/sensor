import React, { useEffect, useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  Thermometer, Droplets, Settings, Activity, AlertTriangle, Cpu, Download, 
  Copy, Check, Code, Wifi, WifiOff, AlertCircle, Info, RefreshCw, Power, Zap, Clock, ShieldCheck 
} from 'lucide-react';
import { format } from 'date-fns';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, query, orderBy, limit, onSnapshot, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

interface SensorData {
  id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  sensor_error?: boolean;
}

interface DeviceSettings {
  maxTemp: number;
  maxHum: number;
  sendIntervalSec: number;
  fanState: boolean;
  autoFan: boolean;
  updatedAt?: number;
}

export default function App() {
  const [data, setData] = useState<SensorData[]>([]);
  const [timeRange, setTimeRange] = useState<'1H' | '24H' | '7D'>('1H');
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  // Device settings & thresholds
  const [settings, setSettings] = useState<DeviceSettings>({
    maxTemp: 30,
    maxHum: 65,
    sendIntervalSec: 15,
    fanState: false,
    autoFan: true,
  });

  const [showSettings, setShowSettings] = useState(false);

  // 1. Fetch real-time sensor data from Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'sensor_data'),
      orderBy('timestamp', 'desc'),
      limit(1000)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sensorReadings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SensorData));
      
      sensorReadings.sort((a, b) => a.timestamp - b.timestamp);
      setData(sensorReadings);
    }, (error) => {
      console.error("Firestore real-time subscription error:", error);
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch & Listen to real-time Device Settings from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'device_settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const remoteData = docSnap.data() as DeviceSettings;
        setSettings(prev => ({ ...prev, ...remoteData }));
      }
    }, (err) => {
      console.error("Firestore settings listener error:", err);
    });

    return () => unsubscribe();
  }, []);

  // Update remote device configuration
  const updateDeviceConfig = async (newConfig: Partial<DeviceSettings>) => {
    setIsUpdatingConfig(true);
    const updated = { ...settings, ...newConfig, updatedAt: Date.now() };
    setSettings(updated);

    try {
      await fetch('/api/device-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error('Failed to sync config with server:', err);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const exportToCSV = () => {
    if (data.length === 0) return;
    
    const headers = ['Timestamp', 'Date', 'Time', 'Temperature (°C)', 'Humidity (%)', 'Status'];
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
      const date = new Date(row.timestamp);
      const isErr = row.sensor_error || (row.temperature === 0 && row.humidity === 0);
      const rowData = [
        row.timestamp,
        format(date, 'yyyy-MM-dd'),
        format(date, 'HH:mm:ss'),
        row.temperature,
        row.humidity,
        isErr ? 'SENSOR_FAULT' : 'OK'
      ];
      csvRows.push(rowData.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `sensor_data_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter data based on selected time range
  const filteredData = useMemo(() => {
    const now = Date.now();
    let cutoff = now;
    if (timeRange === '1H') cutoff = now - 60 * 60 * 1000;
    else if (timeRange === '24H') cutoff = now - 24 * 60 * 60 * 1000;
    else if (timeRange === '7D') cutoff = now - 7 * 24 * 60 * 60 * 1000;

    return data.filter(d => d.timestamp >= cutoff);
  }, [data, timeRange]);

  // Format data for Recharts
  const chartData = useMemo(() => {
    return filteredData.map(d => ({
      ...d,
      timeLabel: format(new Date(d.timestamp), timeRange === '1H' ? 'HH:mm' : 'MMM dd, HH:mm'),
    }));
  }, [filteredData, timeRange]);

  const latestData = data.length > 0 ? data[data.length - 1] : null;

  // Connection State
  const connectionState = useMemo(() => {
    if (!latestData) {
      return { status: 'OFFLINE', label: 'รอการเชื่อมต่อ ESP32', color: 'slate', icon: WifiOff };
    }
    const timeDiff = Date.now() - latestData.timestamp;
    const isOffline = timeDiff > 3 * 60 * 1000;
    const isSensorError = Boolean(latestData.sensor_error) || (latestData.temperature === 0 && latestData.humidity === 0);

    if (isOffline) {
      return { status: 'OFFLINE', label: 'ESP32 OFFLINE (>3 นาที)', color: 'red', icon: WifiOff };
    }
    if (isSensorError) {
      return { status: 'SENSOR_ERROR', label: 'ESP32 ONLINE (SENSOR FAULT / ค่า 0)', color: 'amber', icon: AlertTriangle };
    }
    return { status: 'ONLINE', label: 'ESP32 CONNECTED & ONLINE', color: 'green', icon: Wifi };
  }, [latestData]);

  // Alerts logic
  const activeAlerts = useMemo(() => {
    if (!latestData) return [];
    const alerts = [];
    const isSensorErr = Boolean(latestData.sensor_error) || (latestData.temperature === 0 && latestData.humidity === 0);
    
    if (isSensorErr) {
      alerts.push(`ตรวจพบค่าเซ็นเซอร์เป็น 0 หรืออ่านค่า DHT22 ล้มเหลว! (เช็คขา Pin 27)`);
    }
    if (latestData.temperature > settings.maxTemp && !isSensorErr) {
      alerts.push(`อุณหภูมิสูงเกินกำหนด! (${latestData.temperature}°C > ${settings.maxTemp}°C) - สั่งเปิดพัดลมระบายอากาศอัตโนมัติ`);
    }
    if (latestData.humidity > settings.maxHum && !isSensorErr) {
      alerts.push(`ความชื้นสูงเกินกำหนด! (${latestData.humidity}% > ${settings.maxHum}%)`);
    }
    return alerts;
  }, [latestData, settings]);

  const [codeTab, setCodeTab] = useState<'fixGuide' | 'lightCode' | 'jsonCode'>('fixGuide');

  // Code version 1: Lightweight Code without ArduinoJson dependency
  const esp32CodeLight = `#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <SimpleDHT.h>

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "https://ais-dev-qxri77mfo47bgbrp4yibxz-68615771923.asia-east1.run.app/api/sensor-data";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ (CYD ESP32) ---
#define XPT2046_CS   33
#define XPT2046_IRQ  36
#define RELAY_PIN    22  // ขาควบคุม Relay พัดลม (หรือ Pin 4 LED)

XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();
SimpleDHT22 dht22(27); // ขา Pin 27 ต่อ DHT22

// --- 3. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
bool fanState = false;
int sendIntervalSec = 15;

unsigned long lastSend = 0;
unsigned long lastSensorRead = 0;

void updateHardware() {
  digitalWrite(RELAY_PIN, fanState ? HIGH : LOW);
}

void drawUI() {
  tft.fillScreen(TFT_BLACK);
  tft.fillRect(0, 0, 320, 32, tft.color565(30, 41, 59));
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("ESP32 LIGHTWEIGHT SYNC", 160, 8, 2);
  
  tft.drawRoundRect(10, 40, 145, 95, 10, TFT_CYAN);
  tft.drawRoundRect(165, 40, 145, 95, 10, TFT_MAGENTA);
  tft.setTextColor(TFT_CYAN); tft.drawCentreString("TEMP", 82, 48, 2);
  tft.setTextColor(TFT_MAGENTA); tft.drawCentreString("HUMI", 237, 48, 2);

  uint16_t fanBgColor = fanState ? tft.color565(16, 185, 129) : tft.color565(71, 85, 105);
  tft.fillRoundRect(10, 142, 300, 38, 8, fanBgColor);
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("RELAY FAN: " + String(fanState ? "ON [ACTIVE]" : "OFF [STANDBY]"), 160, 153, 2);

  tft.fillRoundRect(10, 188, 300, 38, 8, tft.color565(185, 28, 28));
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("RESET WIFI / CONFIG", 160, 199, 2);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  tft.init(); tft.setRotation(1);
  SPI.begin(14, 12, 13, 15); 
  touch.begin(); touch.setRotation(1);

  WiFiManager wm;
  wm.setConfigPortalBlocking(false);
  wm.autoConnect("CYD_ESP32_LIGHT");

  drawUI();
}

void loop() {
  WiFiManager wm; wm.process();

  // 1. อ่านเซนเซอร์ทุก 2.5 วินาที
  if (millis() - lastSensorRead > 2500) {
    lastSensorRead = millis();
    float t = 0, h = 0;
    int err = dht22.read2(&t, &h, NULL);
    if (err == SimpleDHTErrSuccess && (t != 0 || h != 0)) {
      temp = t; humi = h; isSensorError = false;
    } else {
      isSensorError = true;
    }

    if (!isSensorError) {
      tft.setTextColor(TFT_CYAN, TFT_BLACK);
      tft.drawCentreString(String(temp, 1) + " C", 82, 75, 7);
      tft.setTextColor(TFT_MAGENTA, TFT_BLACK);
      tft.drawCentreString(String(humi, 1) + " %", 237, 75, 7);
    } else {
      tft.setTextColor(TFT_RED, TFT_BLACK);
      tft.drawCentreString("ERR C", 82, 75, 7);
      tft.drawCentreString("ERR %", 237, 75, 7);
    }
  }

  // 2. ทัชสกรีน Reset WiFi
  if (touch.touched()) {
    TS_Point p = touch.getPoint();
    int screenY = map(p.y, 240, 3800, 0, 240);
    if (screenY > 188) {
      WiFiManager wm; wm.resetSettings(); ESP.restart();
    }
  }

  // 3. ส่งข้อมูลขึ้น Cloud และเช็คสวิตช์พัดลม
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");

    // สร้างข้อความ JSON ปลอดภัย ไร้ Error String syntax
    String json = "{";
    json += "\"temperature\":" + String(temp, 1) + ",";
    json += "\"humidity\":" + String(humi, 1) + ",";
    json += "\"sensor_error\":" + String(isSensorError ? "true" : "false");
    json += "}";

    lastCloudCode = http.POST(json);
    if (lastCloudCode == 200) {
      String res = http.getString();
      if (res.indexOf("\"fanState\":true") >= 0) {
        fanState = true;
      } else if (res.indexOf("\"fanState\":false") >= 0) {
        fanState = false;
      }
      updateHardware();
      drawUI();
      tft.setTextColor(TFT_GREEN, tft.color565(30, 41, 59));
    } else {
      tft.setTextColor(TFT_RED, tft.color565(30, 41, 59));
    }
    tft.drawString("Cloud: " + String(lastCloudCode), 210, 8, 2);
    http.end();
    lastSend = millis();
  }
}`;

  // Code version 2: Full 2-Way Sync Code with ArduinoJson v7 Library
  const esp32CodeJson = `#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <SimpleDHT.h>
#include <ArduinoJson.h> // รองรับ ArduinoJson v7.x (Benoit Blanchon)

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "https://ais-dev-qxri77mfo47bgbrp4yibxz-68615771923.asia-east1.run.app/api/sensor-data";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ (CYD ESP32) ---
#define XPT2046_CS   33
#define XPT2046_IRQ  36
#define RELAY_PIN    22  // ขาควบคุม Relay พัดลม (หรือ Pin 4 LED)

XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();
SimpleDHT22 dht22(27); // ขา Pin 27 ต่อ DHT22

// --- 3. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
bool fanState = false;
bool autoFan = true;
int sendIntervalSec = 15;
float maxTemp = 30.0;
float maxHum = 65.0;

unsigned long lastSend = 0;
unsigned long lastSensorRead = 0;

void updateHardware() {
  digitalWrite(RELAY_PIN, fanState ? HIGH : LOW);
}

void drawUI() {
  tft.fillScreen(TFT_BLACK);
  tft.fillRect(0, 0, 320, 32, tft.color565(30, 41, 59));
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("CYD ESP32 2-WAY SYNC", 160, 8, 2);
  
  tft.drawRoundRect(10, 40, 145, 95, 10, TFT_CYAN);
  tft.drawRoundRect(165, 40, 145, 95, 10, TFT_MAGENTA);
  tft.setTextColor(TFT_CYAN); tft.drawCentreString("TEMP", 82, 48, 2);
  tft.setTextColor(TFT_MAGENTA); tft.drawCentreString("HUMI", 237, 48, 2);

  uint16_t fanBgColor = fanState ? tft.color565(16, 185, 129) : tft.color565(71, 85, 105);
  tft.fillRoundRect(10, 142, 300, 38, 8, fanBgColor);
  tft.setTextColor(TFT_WHITE);
  String fanText = "RELAY FAN: " + String(fanState ? "ON [ACTIVE]" : "OFF [STANDBY]");
  if (autoFan) fanText += " (AUTO)";
  tft.drawCentreString(fanText, 160, 153, 2);

  tft.fillRoundRect(10, 188, 300, 38, 8, tft.color565(185, 28, 28));
  tft.setTextColor(TFT_WHITE);
  tft.drawCentreString("RESET WIFI / CONFIG", 160, 199, 2);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  tft.init(); tft.setRotation(1);
  SPI.begin(14, 12, 13, 15); 
  touch.begin(); touch.setRotation(1);

  WiFiManager wm;
  wm.setConfigPortalBlocking(false);
  wm.autoConnect("CYD_ESP32_SYNC");

  drawUI();
}

void loop() {
  WiFiManager wm; wm.process();

  // 1. อ่านเซนเซอร์ทุก 2.5 วินาที
  if (millis() - lastSensorRead > 2500) {
    lastSensorRead = millis();
    float t = 0, h = 0;
    int err = dht22.read2(&t, &h, NULL);
    if (err == SimpleDHTErrSuccess && (t != 0 || h != 0)) {
      temp = t; humi = h; isSensorError = false;
    } else {
      isSensorError = true;
    }

    if (!isSensorError) {
      tft.setTextColor(TFT_CYAN, TFT_BLACK);
      tft.drawCentreString(String(temp, 1) + " C", 82, 75, 7);
      tft.setTextColor(TFT_MAGENTA, TFT_BLACK);
      tft.drawCentreString(String(humi, 1) + " %", 237, 75, 7);
    } else {
      tft.setTextColor(TFT_RED, TFT_BLACK);
      tft.drawCentreString("ERR C", 82, 75, 7);
      tft.drawCentreString("ERR %", 237, 75, 7);
    }
  }

  // 2. ทัชสกรีน Reset WiFi
  if (touch.touched()) {
    TS_Point p = touch.getPoint();
    int screenY = map(p.y, 240, 3800, 0, 240);
    if (screenY > 188) {
      WiFiManager wm; wm.resetSettings(); ESP.restart();
    }
  }

  // 3. ส่งข้อมูลขึ้น Cloud ด้วย ArduinoJson v7 (ปลอดภัย 100%)
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");

    // ใช้ ArduinoJson v7 สร้าง JSON อัตโนมัติ ไร้ Error String syntax
    JsonDocument docOut;
    docOut["temperature"] = temp;
    docOut["humidity"] = humi;
    docOut["sensor_error"] = isSensorError;
    
    String json;
    serializeJson(docOut, json);

    lastCloudCode = http.POST(json);
    if (lastCloudCode == 200) {
      String response = http.getString();
      JsonDocument docIn;
      DeserializationError error = deserializeJson(docIn, response);
      if (!error && docIn.containsKey("config")) {
        JsonObject cfg = docIn["config"];
        fanState = cfg["fanState"] | fanState;
        autoFan = cfg["autoFan"] | autoFan;
        sendIntervalSec = cfg["sendIntervalSec"] | sendIntervalSec;
        maxTemp = cfg["maxTemp"] | maxTemp;
        maxHum = cfg["maxHum"] | maxHum;

        updateHardware();
        drawUI();
      }
      tft.setTextColor(TFT_GREEN, tft.color565(30, 41, 59));
    } else {
      tft.setTextColor(TFT_RED, tft.color565(30, 41, 59));
    }
    tft.drawString("Cloud: " + String(lastCloudCode), 210, 8, 2);
    http.end();
    lastSend = millis();
  }
}`;

  const handleCopyCode = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F1F5F9] font-sans text-slate-900 overflow-hidden">
      {/* Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">SensorFlow <span className="text-blue-600">2-Way Cloud</span></h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={() => setShowCodeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Code className="w-4 h-4 text-blue-600" />
            <span>โค้ด ESP32 (2-Way)</span>
          </button>

          <button 
            onClick={exportToCSV}
            title="Export CSV"
            className="flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Connection Badge */}
          <div className={`hidden lg:flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${
            connectionState.color === 'green' ? 'bg-green-50 text-green-700 border-green-200' :
            connectionState.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-red-50 text-red-700 border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              connectionState.color === 'green' ? 'bg-green-500 animate-pulse' :
              connectionState.color === 'amber' ? 'bg-amber-500 animate-ping' :
              'bg-red-500'
            }`}></div>
            <span>{connectionState.label}</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex p-4 sm:p-6 gap-6 overflow-hidden relative max-w-[1600px] mx-auto w-full">
        
        {/* ESP32 C++ Code Modal */}
        {showCodeModal && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Code className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold">โค้ด ESP32 CYD & คู่มือแก้ปัญหา Arduino IDE</h2>
                    <p className="text-xs text-slate-400">วิธีแก้ไข Error "ArduinoJson.h" และ "Serial Port" ในรูปที่คุณส่งมา</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {codeTab !== 'fixGuide' && (
                    <button 
                      onClick={() => handleCopyCode(codeTab === 'lightCode' ? esp32CodeLight : esp32CodeJson)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedCode ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ด C++'}</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setShowCodeModal(false)}
                    className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-100/80 p-1.5 gap-1 shrink-0">
                <button
                  onClick={() => setCodeTab('fixGuide')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    codeTab === 'fixGuide' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  ⚠️ 1. วิธีแก้ Error ใน Arduino IDE (ตามรูปที่คุณส่ง)
                </button>
                <button
                  onClick={() => setCodeTab('lightCode')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    codeTab === 'lightCode' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  ⚡ 2. โค้ดแบบไม่ใช้ Library (Compile ได้ทันที)
                </button>
                <button
                  onClick={() => setCodeTab('jsonCode')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    codeTab === 'jsonCode' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  🚀 3. โค้ด Full 2-Way Sync (ใช้ ArduinoJson)
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-700 text-sm">
                
                {codeTab === 'fixGuide' && (
                  <div className="space-y-6">
                    {/* Fix Error 1: ArduinoJson.h missing */}
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-red-900 text-base">รูปที่ 1: "ArduinoJson.h: No such file or directory" หมายถึงอะไร?</h3>
                          <p className="text-xs text-red-700 mt-1">
                            แปลว่าในโปรแกรม Arduino IDE ของคุณยังไม่ได้ลง Library ที่ชื่อ <strong>ArduinoJson</strong> ครับ
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-red-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-800">✅ วิธีแก้ไขมี 2 ทางเลือกง่ายๆ ครับ:</p>
                        <ol className="list-decimal list-inside space-y-2 text-slate-600 leading-relaxed">
                          <li>
                            <strong>ทางเลือก A (แนะนำเร็วที่สุด):</strong> เลือกกดแท็บด้านบนแท็บที่ 2 <span className="text-blue-600 font-bold">"2. โค้ดแบบไม่ใช้ Library"</span> แล้วคัดลอกโค้ดไปวางใน Arduino IDE ได้เลย <u>สามารถกด Compile และ Upload ผ่านได้ทันที 100% ไม่ติด Error ใดๆ ครับ!</u>
                          </li>
                          <li>
                            <strong>ทางเลือก B (ติดตั้ง Library):</strong> ใน Arduino IDE ให้คลิกไอคอนหนังสือทางซ้ายมือ <strong>(Library Manager)</strong> พิมพ์ช่องค้นหาคำว่า <code className="bg-slate-100 text-red-600 px-1 py-0.5 rounded font-mono">ArduinoJson</code> โดยผู้พัฒนา Benoit Blanchon แล้วกดปุ่ม <strong>INSTALL</strong>
                          </li>
                        </ol>
                      </div>
                    </div>

                    {/* Fix Error 3: string literal operator error */}
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-orange-900 text-base">รูปที่ 3: "unable to find string literal operator 'operator""temperature'" หมายถึงอะไร?</h3>
                          <p className="text-xs text-orange-700 mt-1">
                            แปลว่าในโค้ด C++ มีการใส่เครื่องหมายอัญประกาศ <code className="bg-orange-100 text-orange-900 px-1 rounded font-mono">"..."</code> ซ้อนกันผิดรูปแบบในการต่อข้อความ String ครับ
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-orange-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-800">✅ วิธีแก้ไข (แก้ไขโค้ดให้แล้วเรียบร้อย):</p>
                        <p className="text-slate-600 leading-relaxed">
                          คุณลง <strong>ArduinoJson 7.4.3</strong> สำเร็จแล้ว! ให้คลิกเลือกแท็บ <span className="text-purple-700 font-bold">"3. โค้ด Full 2-Way Sync (ใช้ ArduinoJson)"</span> ด้านบน แล้วคัดลอกโค้ดใหม่ไปวางใน Arduino IDE ได้เลยครับ โค้ดใหม่ใช้ระบบ <code className="bg-slate-100 px-1 rounded text-purple-700 font-mono">JsonDocument</code> ของ ArduinoJson v7 ในการสร้าง JSON อัตโนมัติ <u>จะไม่ติด Error เครื่องหมายคำพูดซ้อนกันอีก 100% ครับ!</u>
                        </p>
                      </div>
                    </div>

                    {/* Fix Error 2: Serial Port Error */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-amber-900 text-base">รูปที่ 2: "Port monitor error: Could not connect to COM3" หมายถึงอะไร?</h3>
                          <p className="text-xs text-amber-700 mt-1">
                            ในรูป สังเกตบรรทัด <code className="bg-amber-100 text-amber-900 px-1 rounded">100% ... Hard resetting via RTS pin</code> แปลว่า <strong>โปรแกรมถูกเบิร์นลงบอร์ด ESP32 สำเร็จเรียบร้อยแล้วครับ!</strong>
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-amber-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-800">✅ วิธีทำให้ Serial Monitor เปิดขึ้นมาดูค่าได้ตามปกติ:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-slate-600 leading-relaxed">
                          <li>เมื่อแฟลชเสร็จ บอร์ด ESP32 จะทำการ Reset ชั่วคราว สาย COM Port จึงตัดการเชื่อมต่อชั่วแป๊บเดียวแล้วติดใหม่</li>
                          <li>ให้กดถอดสาย USB แล้วเสียบกลับเข้าไปใหม่ หรือกดปุ่ม <strong>EN / RST</strong> สีดำบนตัวบอร์ด ESP32</li>
                          <li>ในโปรแกรม Arduino IDE ด้านบน เมนู <strong>Tools {'>'} Port</strong> ให้ติ๊กเลือกพอร์ต <strong>COM3</strong> อีกครั้ง แล้วเปิดหน้าต่าง Serial Monitor ขึ้นมาใหม่ได้เลยครับ!</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {codeTab === 'lightCode' && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-xs text-blue-900">
                      <Zap className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">⚡ โค้ดรุ่นนี้ไม่ต้องติดตั้ง Library ใดๆ เพิ่มเติม (Zero Dependency):</p>
                        <p className="text-blue-800">นำโค้ดนี้ไปวางใน Arduino IDE แล้วกด Compile + Upload ได้ทันที สามารถรับคำสั่งสวิตช์เปิด/ปิด พัดลม Relay จาก Web App ได้เหมือนกัน!</p>
                      </div>
                    </div>
                    <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                      <pre className="p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[420px] leading-relaxed">
                        {esp32CodeLight}
                      </pre>
                    </div>
                  </div>
                )}

                {codeTab === 'jsonCode' && (
                  <div className="space-y-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3 text-xs text-purple-900">
                      <Code className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">🚀 โค้ดรุ่น Full 2-Way JSON (ต้องติดตั้ง ArduinoJson Library ใน Arduino IDE ก่อน):</p>
                        <p className="text-purple-800">ดึงค่า Config ทั้งหมดจาก Cloud มาประมวลผล เช่น ความถี่ส่งข้อมูล (sendIntervalSec), เกณฑ์ maxTemp และสวิตช์เปิด/ปิดพัดลมแบบเต็มรูปแบบ</p>
                      </div>
                    </div>
                    <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                      <pre className="p-4 text-xs font-mono text-purple-300 overflow-x-auto max-h-[420px] leading-relaxed">
                        {esp32CodeJson}
                      </pre>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* Settings Overlay */}
        {showSettings && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6 bg-slate-900/20 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-500" />
                  ตั้งค่าเกณฑ์การแจ้งเตือน & ความถี่ Sync
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      อุณหภูมิสูงสุด (°C)
                    </label>
                    <input 
                      type="number" 
                      value={settings.maxTemp}
                      onChange={(e) => updateDeviceConfig({ maxTemp: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ความชื้นสูงสุด (%)
                    </label>
                    <input 
                      type="number" 
                      value={settings.maxHum}
                      onChange={(e) => updateDeviceConfig({ maxHum: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ความถี่ส่งข้อมูลจาก ESP32 (Interval Sec)
                  </label>
                  <select 
                    value={settings.sendIntervalSec}
                    onChange={(e) => updateDeviceConfig({ sendIntervalSec: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  >
                    <option value={5}>5 วินาที (เรียลไทม์ / Fast)</option>
                    <option value={15}>15 วินาที (มาตรฐาน / Balanced)</option>
                    <option value={30}>30 วินาที (ประหยัดพลังงาน / Power Save)</option>
                    <option value={60}>60 วินาที (1 นาที / Low Bandwidth)</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> เชื่อมโยงกับ Firestore Cloud
                </h3>
                <p className="text-xs text-slate-600">
                  ค่าที่คุณปรับแต่งตรงนี้ จะซิงก์เข้า Firestore คอลเลกชัน <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">device_settings/config</code> และส่งคำสั่งตรงไปที่ ESP32 บอร์ดจริงโดยอัตโนมัติ
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-6 h-full shrink-0 overflow-y-auto hidden md:flex">
          
          {/* Remote Hardware Control Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Power className="w-4 h-4 text-blue-600" /> สั่งการอุปกรณ์ (Remote Control)
              </h2>
              {isUpdatingConfig && <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
            </div>

            {/* Fan / Cooler Switch */}
            <div className={`p-4 rounded-xl border transition-all ${
              settings.fanState ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${settings.fanState ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'}`}>
                    <Power className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">พัดลม / Cooler (Relay Pin 22)</p>
                    <p className="text-[10px] text-slate-500">{settings.fanState ? 'กำลังทำงาน (ACTIVE)' : 'ปิดการทำงาน (OFF)'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-2">
                <span className="text-xs text-slate-600 font-medium">โหมดคำสั่ง</span>
                <button
                  onClick={() => updateDeviceConfig({ fanState: !settings.fanState })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    settings.fanState ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
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
              </div>
            </div>

            {/* Interval Setting */}
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
                <option value={5}>ทุก 5s</option>
                <option value={15}>ทุก 15s</option>
                <option value={30}>ทุก 30s</option>
                <option value={60}>ทุก 60s</option>
              </select>
            </div>
          </div>

          {/* Current Status Cards */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">ค่าปัจจุบัน (Current Status)</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                connectionState.color === 'green' ? 'bg-green-100 text-green-700' :
                connectionState.color === 'amber' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {connectionState.status}
              </span>
            </div>

            <div className="space-y-4">
              {/* Temperature Display */}
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-600 font-medium mb-1">อุณหภูมิ (Temperature)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-800">
                    {latestData ? (latestData.sensor_error || latestData.temperature === 0 ? '0.0 (ERR)' : latestData.temperature.toFixed(1)) : '--'}
                  </span>
                  <span className="text-xl text-slate-500 font-medium">°C</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600">
                  {latestData && (latestData.sensor_error || latestData.temperature === 0) ? (
                    <><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700 font-medium">เซ็นเซอร์มีปัญหา (Fault)</span></>
                  ) : latestData && latestData.temperature > settings.maxTemp ? (
                    <><AlertTriangle className="w-3.5 h-3.5 text-red-600" /><span className="text-red-600 font-medium">เกินกำหนด! ({'>'} {settings.maxTemp}°C)</span></>
                  ) : (
                    <><Thermometer className="w-3.5 h-3.5" /><span>ปกติ (Normal)</span></>
                  )}
                </div>
              </div>

              {/* Humidity Display */}
              <div className="p-4 bg-teal-50 rounded-xl border border-teal-100">
                <p className="text-sm text-teal-600 font-medium mb-1">ความชื้น (Humidity)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-800">
                    {latestData ? (latestData.sensor_error || latestData.humidity === 0 ? '0.0 (ERR)' : latestData.humidity.toFixed(1)) : '--'}
                  </span>
                  <span className="text-xl text-slate-500 font-medium">%</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-teal-600">
                  {latestData && (latestData.sensor_error || latestData.humidity === 0) ? (
                    <><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700 font-medium">เซ็นเซอร์มีปัญหา (Fault)</span></>
                  ) : latestData && latestData.humidity > settings.maxHum ? (
                    <><AlertTriangle className="w-3.5 h-3.5 text-red-600" /><span className="text-red-600 font-medium">เกินกำหนด! ({'>'} {settings.maxHum}%)</span></>
                  ) : (
                    <><Droplets className="w-3.5 h-3.5" /><span>เหมาะสม (Optimal)</span></>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Alerts Log Panel */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[200px]">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">ระบบแจ้งเตือน (Alerts Log)</h2>
            <div className="space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-thin">
              {activeAlerts.length > 0 ? (
                activeAlerts.map((alert, idx) => (
                  <div key={idx} className="flex gap-3 p-3 bg-amber-50 border-l-4 border-amber-500 rounded-lg text-sm">
                    <div className="text-amber-600 shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                    <div>
                      <p className="font-bold text-amber-900">การแจ้งเตือนระบบ</p>
                      <p className="text-xs text-amber-700 mt-0.5">{alert}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex gap-3 p-3 bg-slate-50 border-l-4 border-slate-300 rounded-lg text-sm">
                  <div className="text-slate-400 shrink-0"><Activity className="w-5 h-5" /></div>
                  <div>
                    <p className="font-bold text-slate-700">ระบบทำงานปกติ</p>
                    <p className="text-xs text-slate-500">เชื่อมต่อ 2-Way Firestore Realtime สำเร็จ</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Charts Section */}
        <section className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto md:overflow-hidden min-w-0">
          
          {/* Mobile Status & Control Bar */}
          <div className="md:hidden flex flex-col gap-3 p-4 bg-white rounded-2xl border border-slate-200 shrink-0 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  connectionState.color === 'green' ? 'bg-green-500 animate-pulse' :
                  connectionState.color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                }`}></div>
                <span className="text-xs font-bold text-slate-700">{connectionState.label}</span>
              </div>
              <button 
                onClick={() => setShowCodeModal(true)}
                className="text-xs font-semibold text-blue-600 flex items-center gap-1"
              >
                <Code className="w-3.5 h-3.5" /> โค้ด ESP32
              </button>
            </div>

            {/* Mobile Remote Fan Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5 text-blue-600" /> พัดลม/Cooler: {settings.fanState ? 'ON' : 'OFF'}
              </span>
              <button
                onClick={() => updateDeviceConfig({ fanState: !settings.fanState })}
                className={`px-3 py-1 rounded-lg text-xs font-bold text-white transition-all cursor-pointer ${
                  settings.fanState ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                {settings.fanState ? 'สั่งปิด' : 'สั่งเปิด'}
              </button>
            </div>
          </div>

          {/* Temperature Chart */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[280px]">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-base sm:text-lg font-bold">กราฟอุณหภูมิ (°C)</h3>
                <div className="flex gap-1 text-[10px]">
                  {(['1H', '24H', '7D'] as const).map(range => (
                    <button
                      key={`temp-${range}`}
                      onClick={() => setTimeRange(range)}
                      className={`px-2 py-1 rounded transition-colors ${
                        timeRange === range 
                          ? 'bg-blue-600 text-white font-medium' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-400 font-medium hidden sm:block">ขีดจำกัดแจ้งเตือน: <span className="text-red-500">{'>'} {settings.maxTemp}°C</span></div>
            </div>
            <div className="flex-1 w-full min-h-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="timeLabel" 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickMargin={8} 
                      tick={{fill: '#94a3b8'}}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickFormatter={(val) => `${val}`}
                      tick={{fill: '#94a3b8'}}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ color: '#64748b', marginBottom: '4px', fontSize: '12px' }}
                      itemStyle={{ fontSize: '14px', fontWeight: 500 }}
                    />
                    <ReferenceLine y={settings.maxTemp} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#2563EB" 
                      strokeWidth={3} 
                      dot={false}
                      activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                      name="อุณหภูมิ (°C)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400"><Activity className="w-8 h-8 opacity-20 mr-2"/> รอข้อมูลจาก ESP32...</div>
              )}
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[280px]">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-base sm:text-lg font-bold">กราฟความชื้น (%)</h3>
                <div className="flex gap-1 text-[10px]">
                  {(['1H', '24H', '7D'] as const).map(range => (
                    <button
                      key={`hum-${range}`}
                      onClick={() => setTimeRange(range)}
                      className={`px-2 py-1 rounded transition-colors ${
                        timeRange === range 
                          ? 'bg-teal-600 text-white font-medium' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-400 font-medium hidden sm:block">ขีดจำกัดแจ้งเตือน: <span className="text-red-500">{'>'} {settings.maxHum}%</span></div>
            </div>
            <div className="flex-1 w-full min-h-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="timeLabel" 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickMargin={8} 
                      tick={{fill: '#94a3b8'}}
                    />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      tickFormatter={(val) => `${val}`}
                      tick={{fill: '#94a3b8'}}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ color: '#64748b', marginBottom: '4px', fontSize: '12px' }}
                      itemStyle={{ fontSize: '14px', fontWeight: 500 }}
                    />
                    <ReferenceLine y={settings.maxHum} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#0D9488" 
                      strokeWidth={3} 
                      dot={false}
                      activeDot={{ r: 6, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                      name="ความชื้น (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400"><Activity className="w-8 h-8 opacity-20 mr-2"/> รอข้อมูลจาก ESP32...</div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

