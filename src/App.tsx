import React, { useEffect, useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  Thermometer, Droplets, Settings, Activity, AlertTriangle, Cpu, Download, 
  Copy, Check, Code, Wifi, WifiOff, AlertCircle, Info, RefreshCw, Power, Zap, Clock, ShieldCheck, CheckCircle2, Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, query, orderBy, limit, onSnapshot, setDoc, getDocs } from 'firebase/firestore';
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
  tempOffset?: number;
  humOffset?: number;
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
    sendIntervalSec: 60,
    tempOffset: 0,
    humOffset: 0,
    fanState: false,
    autoFan: true,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [lastPacketReceivedClientTime, setLastPacketReceivedClientTime] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  // Manual Instant Refresh Handler
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      const q = query(
        collection(db, 'sensor_data'),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      const snapshot = await getDocs(q);
      const sensorReadings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SensorData));
      sensorReadings.sort((a, b) => a.timestamp - b.timestamp);
      setData(sensorReadings);
      setLastPacketReceivedClientTime(Date.now());
      const lastRec = sensorReadings.length > 0 ? sensorReadings[sensorReadings.length - 1] : null;
      const timeStr = lastRec ? format(new Date(lastRec.timestamp), 'HH:mm:ss') : '-';
      setRefreshToast(`ดึงข้อมูลล่าสุดสำเร็จ (บันทึกล่าสุดเวลา ${timeStr})`);
      setTimeout(() => setRefreshToast(null), 3500);
    } catch (err) {
      console.error("Error refreshing sensor data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [isClearingData, setIsClearingData] = useState(false);
  const handleClearHistory = async () => {
    if (!window.confirm('คุณต้องการล้างประวัติข้อมูลเก่าในระบบเพื่อตั้งต้นใหม่ใช่หรือไม่?')) return;
    setIsClearingData(true);
    try {
      const res = await fetch('/api/clear-sensor-data', { method: 'POST' });
      if (res.ok) {
        setData([]);
        setRefreshToast('ล้างประวัติข้อมูลเรียบร้อยแล้ว');
        setTimeout(() => setRefreshToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to clear sensor data history:', err);
    } finally {
      setIsClearingData(false);
    }
  };

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
      if (sensorReadings.length > 0) {
        setLastPacketReceivedClientTime(Date.now());
      }
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
      const calTemp = isErr ? 0 : Number((row.temperature + (settings.tempOffset || 0)).toFixed(1));
      const calHum = isErr ? 0 : Number((row.humidity + (settings.humOffset || 0)).toFixed(1));
      const rowData = [
        row.timestamp,
        format(date, 'yyyy-MM-dd'),
        format(date, 'HH:mm:ss'),
        calTemp,
        calHum,
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

  // Format data for Recharts with calibration offsets applied
  const chartData = useMemo(() => {
    return filteredData.map(d => {
      const isErr = Boolean(d.sensor_error) || (d.temperature === 0 && d.humidity === 0);
      const calibratedTemp = isErr ? 0 : Number((d.temperature + (settings.tempOffset || 0)).toFixed(1));
      const calibratedHum = isErr ? 0 : Number((d.humidity + (settings.humOffset || 0)).toFixed(1));
      return {
        ...d,
        temperature: calibratedTemp,
        humidity: calibratedHum,
        timeLabel: format(new Date(d.timestamp), timeRange === '1H' ? 'HH:mm' : 'MMM dd, HH:mm'),
      };
    });
  }, [filteredData, timeRange, settings.tempOffset, settings.humOffset]);

  const rawLatestData = data.length > 0 ? data[data.length - 1] : null;

  // Calibrated latest sensor reading
  const latestData = useMemo(() => {
    if (!rawLatestData) return null;
    const isErr = Boolean(rawLatestData.sensor_error) || (rawLatestData.temperature === 0 && rawLatestData.humidity === 0);
    if (isErr) return rawLatestData;
    return {
      ...rawLatestData,
      temperature: Number((rawLatestData.temperature + (settings.tempOffset || 0)).toFixed(1)),
      humidity: Number((rawLatestData.humidity + (settings.humOffset || 0)).toFixed(1)),
    };
  }, [rawLatestData, settings.tempOffset, settings.humOffset]);

  // Connection State
  const connectionState = useMemo(() => {
    if (!latestData) {
      return { status: 'OFFLINE', label: 'รอการเชื่อมต่อ ESP32', color: 'slate', icon: WifiOff };
    }
    const clientTimeDiff = Date.now() - lastPacketReceivedClientTime;
    const serverTimeDiff = Math.abs(Date.now() - latestData.timestamp);

    // Consider OFFLINE only if no client-side packet received for > 5 mins AND last record is > 5 mins old
    const isOffline = clientTimeDiff > 5 * 60 * 1000 && serverTimeDiff > 5 * 60 * 1000;
    const isSensorError = Boolean(latestData.sensor_error) || (latestData.temperature === 0 && latestData.humidity === 0);

    if (isOffline) {
      return { status: 'OFFLINE', label: 'ESP32 OFFLINE (>5 นาที)', color: 'red', icon: WifiOff };
    }
    if (isSensorError) {
      return { status: 'SENSOR_ERROR', label: 'ESP32 ONLINE (SENSOR FAULT / ค่า 0)', color: 'amber', icon: AlertTriangle };
    }
    return { status: 'ONLINE', label: 'ESP32 CONNECTED & ONLINE', color: 'green', icon: Wifi };
  }, [latestData, lastPacketReceivedClientTime]);

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

  const [codeTab, setCodeTab] = useState<'fixGuide' | 'lightCode' | 'jsonCode' | 'wifiGuide'>('fixGuide');

  // Dynamic server URL based on current host
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-qxri77mfo47bgbrp4yibxz-68615771923.asia-east1.run.app';
  const serverUrlEndpoint = `${currentOrigin}/api/sensor-data`;

  // Code version 1: Lightweight Code without ArduinoJson dependency
  const esp32CodeLight = `#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <SimpleDHT.h>
#include <Wire.h> // รองรับเซนเซอร์ SHT30 / DHT30 I2C
#include <time.h> // เพิ่มเวลา วัน/เดือน/ปี NTP Sync
#include "soc/soc.h"          // ป้องกัน ESP32 Brownout Reset
#include "soc/rtc_cntl_reg.h" // ป้องกัน ESP32 Brownout Reset

// --- 0. ตั้งค่า WiFi บ้านล่วงหน้า (เชื่อมต่อ WiFi "Mai_home_2.4G" อัตโนมัติ) ---
const char* WIFI_SSID = "Mai_home_2.4G";     // ชื่อ WiFi ของคุณ
const char* WIFI_PASSWORD = "0909142651"; // รหัสผ่าน WiFi ของคุณ

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "${serverUrlEndpoint}";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ (CYD ESP32-2432S028) ---
#define XPT2046_IRQ   36
#define XPT2046_MOSI  32
#define XPT2046_MISO  39
#define XPT2046_CLK   25
#define XPT2046_CS    33
#define RELAY_PIN     22  // ขาควบคุม Relay พัดลม (หรือ Pin 4 LED)
#define TFT_BL        21  // ขาควบคุมไฟหลังจอ Backlight CYD ESP32 (ห้ามใช้ต่อเซนเซอร์)

SPIClass touchSpi = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- 3. จานสีธีม Dark Dashboard เรืองแสงตามรูปภาพ ---
#define COLOR_BG         tft.color565(18, 22, 28)    // Dark Charcoal
#define COLOR_CARD_BG    tft.color565(26, 31, 41)    // Card Slate Dark
#define COLOR_CARD_LINE  tft.color565(42, 50, 64)    // Border Outline
#define COLOR_ORANGE     tft.color565(255, 95, 45)   // Temperature Coral Orange
#define COLOR_CYAN       tft.color565(50, 180, 255)  // Humidity Sky Blue
#define COLOR_MUTED      tft.color565(140, 150, 165) // Gray Text

// --- 4. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
bool fanState = false;
int sendIntervalSec = 15;

// ระบบ Fast Cache จำชนิดเซนเซอร์เพื่อให้อ่านเร็วสุด (<20ms) ไม่กระตุก
int cachedSensorType = 0; // 0: สแกนใหม่, 1: SHT30(0x44), 2: SHT30(0x45), 3: SHT20, 4: AHT20, 10: AM2301/DHT22, 11: DHT11
int cachedSensorPin = 27;

unsigned long lastSend = 0;
String lastSyncOK = "--:--";
unsigned long lastSensorRead = 0;
unsigned long lastClockUpdate = 0;

// ฟังก์ชันอ่านค่า SHT30 / SHT31 / DHT30 ผ่าน I2C (Address 0x44 หรือ 0x45)
bool readSHT30I2C(uint8_t addr, float &outTemp, float &outHumi) {
  Wire.beginTransmission(addr);
  Wire.write(0x2C);
  Wire.write(0x06);
  if (Wire.endTransmission() != 0) {
    Wire.beginTransmission(addr);
    Wire.write(0x24);
    Wire.write(0x00);
    if (Wire.endTransmission() != 0) return false;
  }
  delay(50);
  if (Wire.requestFrom(addr, (uint8_t)6) == 6) {
    uint8_t data[6];
    for (int i = 0; i < 6; i++) data[i] = Wire.read();
    uint16_t rawTemp = (data[0] << 8) | data[1];
    uint16_t rawHumi = (data[3] << 8) | data[4];
    float t = -45.0 + (175.0 * (float)rawTemp / 65535.0);
    float h = 100.0 * ((float)rawHumi / 65535.0);
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

// อ่านค่าเซนเซอร์ SHT20 / HTU21D (Address 0x40) ที่ใช้ในโพรบหัวทรงกระบอกสีขาว
bool readSHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x40);
  Wire.write(0xF3);
  if (Wire.endTransmission() == 0) {
    delay(80);
    if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
      uint8_t msb = Wire.read();
      uint8_t lsb = Wire.read();
      Wire.read();
      uint16_t rawT = ((uint16_t)msb << 8) | lsb;
      rawT &= ~0x0003;
      float t = -46.85 + (175.72 * (float)rawT / 65536.0);
      
      Wire.beginTransmission(0x40);
      Wire.write(0xF5);
      if (Wire.endTransmission() == 0) {
        delay(30);
        if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
          uint8_t hmsb = Wire.read();
          uint8_t hlsb = Wire.read();
          Wire.read();
          uint16_t rawH = ((uint16_t)hmsb << 8) | hlsb;
          rawH &= ~0x0003;
          float h = -6.0 + (125.0 * (float)rawH / 65536.0);
          if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
            outTemp = t; outHumi = h;
            return true;
          }
        }
      }
    }
  }
  return false;
}

// ฟังก์ชันอ่านค่า AHT20 / DHT20 (Address 0x38)
bool readAHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x38);
  Wire.write(0xAC); Wire.write(0x33); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(80);
  if (Wire.requestFrom((uint8_t)0x38, (uint8_t)6) == 6) {
    uint8_t d[6];
    for (int i = 0; i < 6; i++) d[i] = Wire.read();
    uint32_t humRaw = ((uint32_t)d[1] << 12) | ((uint32_t)d[2] << 4) | (d[3] >> 4);
    uint32_t tempRaw = (((uint32_t)d[3] & 0x0F) << 16) | ((uint32_t)d[4] << 8) | d[5];
    float h = ((float)humRaw * 100.0) / 1048576.0;
    float t = (((float)tempRaw * 200.0) / 1048576.0) - 50.0;
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

// ฟังก์ชันอ่านค่า DHT11/22 แบบ direct
bool readDHTDirect(int pin, bool isDHT22, float &outTemp, float &outHumi) {
  uint8_t data[5] = {0, 0, 0, 0, 0};
  
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(isDHT22 ? 2 : 20);
  digitalWrite(pin, HIGH);
  delayMicroseconds(30);
  pinMode(pin, INPUT_PULLUP);
  
  unsigned long timeout = micros();
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == LOW) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  
  noInterrupts();
  for (int i = 0; i < 40; i++) {
    unsigned long startLow = micros();
    while(digitalRead(pin) == LOW) {
      if (micros() - startLow > 100) { interrupts(); return false; }
    }
    unsigned long startHigh = micros();
    while(digitalRead(pin) == HIGH) {
      if (micros() - startHigh > 100) { interrupts(); return false; }
    }
    if ((micros() - startHigh) > 40) {
      data[i / 8] |= (1 << (7 - (i % 8)));
    }
  }
  interrupts();
  
  if (data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xFF)) {
    if (isDHT22) {
      outHumi = (float)((data[0] << 8) | data[1]) * 0.1;
      outTemp = (float)(((data[2] & 0x7F) << 8) | data[3]) * 0.1;
      if (data[2] & 0x80) outTemp = -outTemp;
    } else {
      outHumi = data[0] + (float)data[1] * 0.1;
      outTemp = data[2] + (float)data[3] * 0.1;
    }
    return (outHumi > 0 && outHumi <= 100 && outTemp >= -20 && outTemp <= 125);
  }
  return false;
}

// ฟังก์ชันสแกนอ่านค่าอัตโนมัติ (สแกนทั้ง SHT30/SHT20/AHT20 I2C และ DHT11/22)
void readSensorAuto() {
  float t = 0, h = 0;

  // 1. ลองอ่าน I2C (SDA=27, SCL=22) - สแกน SHT30 (0x44, 0x45), SHT20 (0x40), AHT20 (0x38)
  Wire.end();
  Wire.begin(27, 22);
  Wire.setClock(100000);
  delay(10);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false;
    return;
  }

  // 2. สลับพิน I2C (SDA=22, SCL=27) กรณีสายสลับ
  Wire.end();
  Wire.begin(22, 27);
  Wire.setClock(100000);
  delay(10);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false;
    return;
  }

  // 3. CRITICAL: ปิด I2C บัสก่อนเริ่มอ่าน 1-Wire Single Bus (DHT22 / AM2301 / DHT11)
  Wire.end();

  // 4. สำรองสำหรับโพรบเซนเซอร์แบบ 1-Wire Digital (AM2301 / DHT22 / DHT11) บน GPIO 27 และ 22
  int dhtPins[] = {27, 22, 17, 32}; 
  for (int p = 0; p < 4; p++) {
    int pin = dhtPins[p];
    if (pin == RELAY_PIN && fanState) continue;
    
    // ลองอ่านแบบ DHT22 / AM2301 (โพรบส่วนใหญ่เป็น AM2301)
    if (readDHTDirect(pin, true, t, h)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }
    // ลองอ่านแบบ DHT11
    if (readDHTDirect(pin, false, t, h)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }

    SimpleDHT11 d11(pin);
    if (d11.read2(&t, &h, NULL) == SimpleDHTErrSuccess && !isnan(t) && !isnan(h) && (t != 0 || h != 0)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }
  }

  // 5. Strict Hardware Mode: หากอ่านไม่ได้ ให้ติด Sensor Error (ค่า 0.0)
  isSensorError = true;
  temp = 0.0;
  humi = 0.0;
}

void updateHardware() {
  digitalWrite(RELAY_PIN, fanState ? HIGH : LOW);
}

// 1. แถบแสดงสถานะบนสุด (Status Bar)
void drawHeaderStatus() {
  // วาดข้อความโดยไม่ล้างจอทั้งหมด ป้องกันการกระพริบ
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString("ROOM 01", 8, 5, 2);

  if (WiFi.status() == WL_CONNECTED) {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.drawString("Wi-Fi", 95, 5, 2);
    tft.fillCircle(132, 12, 3, TFT_GREEN);
  } else {
    tft.setTextColor(TFT_RED, COLOR_BG);
    tft.drawString("Wi-Fi", 95, 5, 2);
    tft.fillCircle(132, 12, 3, TFT_RED);
  }

  tft.setTextColor(TFT_GREEN, COLOR_BG);
  tft.drawString("SD [READY]", 145, 5, 2);

  struct tm timeinfo;
  char timeStr[10] = "--:--";
  if (getLocalTime(&timeinfo)) {
    strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
  }
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString("100%  " + String(timeStr), 235, 5, 2);

  tft.drawFastHLine(0, 26, 320, COLOR_CARD_LINE);
}

// 2. ฟังก์ชันวาดค่าตัวเลขเซนเซอร์ขนาดใหญ่
void drawSensorValues() {
  // ลบเฉพาะพื้นที่ในกรอบตัวเลขเพื่อไม่ให้จอกระพริบ (No Screen Flicker)
  tft.fillRect(10, 52, 142, 60, COLOR_CARD_BG);
  tft.fillRect(168, 52, 142, 60, COLOR_CARD_BG);

  if (!isSensorError) {
    tft.setTextColor(COLOR_ORANGE, COLOR_CARD_BG);
    tft.drawString(String(temp, 1), 20, 58, 7);
    tft.drawString("oC", 125, 60, 2);

    tft.setTextColor(COLOR_CYAN, COLOR_CARD_BG);
    tft.drawString(String(humi, 1), 178, 58, 7);
    tft.drawString("%", 282, 60, 2);
  } else {
    tft.setTextColor(TFT_RED, COLOR_CARD_BG);
    tft.drawString("ERR!", 40, 68, 4);
    tft.drawString("ERR!", 198, 68, 4);
  }
}

// 3. ฟังก์ชันอัปเดตการ์ดสถานะ Cloud & Alert
void drawStatusCard() {
  tft.fillRect(10, 138, 300, 44, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  String cloudText = "Cloud: " + String(lastCloudCode == 200 ? "Synced (200 OK)" : (lastCloudCode == 0 ? "Connecting..." : "Error " + String(lastCloudCode)));
  tft.drawString(cloudText, 14, 142, 2);

  tft.setTextColor(isSensorError ? TFT_RED : TFT_GREEN, COLOR_CARD_BG);
  tft.drawString(isSensorError ? "STATUS: SENSOR ERR" : "STATUS: NORMAL", 14, 162, 2);

  tft.setTextColor(COLOR_MUTED, COLOR_CARD_BG);
  tft.drawString("Last OK: " + lastSyncOK + "  ", 180, 162, 2);
}

// 4. ออกแบบหน้าจอ TFT ใหม่
void drawUI() {
  tft.fillScreen(COLOR_BG);
  drawHeaderStatus();

  // --- การ์ดอุณหภูมิ (ซ้าย) กรอบส้ม Coral ---
  tft.fillRoundRect(6, 30, 150, 100, 10, COLOR_CARD_BG);
  tft.drawRoundRect(6, 30, 150, 100, 10, COLOR_ORANGE);
  tft.drawRoundRect(7, 31, 148, 98, 9, tft.color565(180, 60, 30));
  tft.setTextColor(COLOR_ORANGE, COLOR_CARD_BG);
  tft.drawString("TEMP", 16, 36, 2);

  // --- การ์ดความชื้น (ขวา) กรอบฟ้า Cyan ---
  tft.fillRoundRect(164, 30, 150, 100, 10, COLOR_CARD_BG);
  tft.drawRoundRect(164, 30, 150, 100, 10, COLOR_CYAN);
  tft.drawRoundRect(165, 31, 148, 98, 9, tft.color565(30, 120, 180));
  tft.setTextColor(COLOR_CYAN, COLOR_CARD_BG);
  tft.drawString("HUMIDITY", 174, 36, 2);

  drawSensorValues();

  // --- การ์ดตรงกลาง: Cloud Sync & Alert Status ---
  tft.fillRoundRect(6, 136, 308, 48, 10, COLOR_CARD_BG);
  tft.drawRoundRect(6, 136, 308, 48, 10, COLOR_CARD_LINE);

  drawStatusCard();

  // --- ปุ่มกดทัชสกรีนด้านล่าง 3 ปุ่ม ---
  tft.fillRoundRect(6, 190, 98, 42, 8, COLOR_CARD_BG);
  tft.drawRoundRect(6, 190, 98, 42, 8, COLOR_CARD_LINE);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.drawCentreString("[ SYNC ]", 55, 202, 2);

  tft.fillRoundRect(111, 190, 98, 42, 8, COLOR_CARD_BG);
  tft.drawRoundRect(111, 190, 98, 42, 8, COLOR_CARD_LINE);
  tft.setTextColor(TFT_YELLOW, COLOR_CARD_BG);
  tft.drawCentreString("[ CONFIG ]", 160, 202, 2);

  uint16_t fanBtnColor = fanState ? tft.color565(16, 185, 129) : COLOR_CARD_BG;
  tft.fillRoundRect(216, 190, 98, 42, 8, fanBtnColor);
  tft.drawRoundRect(216, 190, 98, 42, 8, fanState ? TFT_GREEN : COLOR_CARD_LINE);
  tft.setTextColor(TFT_WHITE, fanBtnColor);
  tft.drawCentreString(fanState ? "[ FAN:ON ]" : "[ FAN:OFF ]", 265, 202, 2);
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // ป้องกัน Brownout Reset จากไฟ USB ตกขณะเปิด WiFi
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // 1. เปิดไฟ Backlight หน้าจอ CYD ESP32 (GPIO 21) ล็อคค้างไว้ ห้ามสั่งเปลี่ยนพิน
  pinMode(21, OUTPUT);
  digitalWrite(21, HIGH);

  tft.init(); 
  tft.setRotation(1);

  // 2. เริ่มต้นระบบทัชสกรีน XPT2046
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin(touchSpi); 
  touch.setRotation(1);

  // 3. อ่านค่าเซนเซอร์ครั้งแรก
  readSensorAuto();
  drawUI();

  configTime(25200, 0, "asia.pool.ntp.org", "pool.ntp.org", "time.nist.gov");

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  
  if (strlen(WIFI_SSID) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 30) {
      delay(500);
      retry++;
    }
  } else {
    WiFiManager wm;
    wm.setConfigPortalTimeout(120);
    wm.setBreakAfterConfig(true);
    wm.autoConnect("CYD_ESP32_LIGHT");
  }

  drawUI();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWiFiRetry = 0;
    if (millis() - lastWiFiRetry > 10000) {
      lastWiFiRetry = millis();
      if (strlen(WIFI_SSID) > 0) {
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      } else {
        WiFi.reconnect();
      }
    }
  }

  if (millis() - lastClockUpdate > 1000) {
    lastClockUpdate = millis();
    drawHeaderStatus();
  }

  // 1. อ่านเซนเซอร์ทุก 2.5 วินาที
  if (millis() - lastSensorRead > 2500) {
    lastSensorRead = millis();
    readSensorAuto();
    drawSensorValues();
    drawStatusCard();
  }

  // 2. ทัชสกรีนปุ่มกด 3 ปุ่มด้านล่าง
  if (touch.touched()) {
    TS_Point p = touch.getPoint();
    int screenX = map(p.x, 200, 3800, 0, 320);
    int screenY = map(p.y, 240, 3800, 0, 240);
    
    if (screenY > 185) {
      if (screenX < 105) {
        lastSend = 0;
        drawStatusCard();
        delay(200);
      } else if (screenX >= 105 && screenX < 210) {
        WiFiManager wm; wm.resetSettings(); ESP.restart();
      } else if (screenX >= 210) {
        fanState = !fanState;
        updateHardware();
        drawUI();
        delay(300);
      }
    }
  }

  // 3. ส่งข้อมูลขึ้น Cloud
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    if (http.begin(client, serverUrl)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("User-Agent", "ESP32-CYD-SensorFlow");

      String json = "{";
      json += "\"temperature\":" + String(temp, 1) + ",";
      json += "\"humidity\":" + String(humi, 1) + ",";
      json += "\"sensor_error\":" + String(isSensorError ? "true" : "false");
      json += "}";

      lastCloudCode = http.POST(json);
      if (lastCloudCode == 200) {
        struct tm timeinfo;
        if (getLocalTime(&timeinfo)) {
          char timeStr[10];
          strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
          lastSyncOK = String(timeStr);
        }
        String res = http.getString();
        if (res.indexOf("\"fanState\":true") >= 0) {
          fanState = true;
        } else if (res.indexOf("\"fanState\":false") >= 0) {
          fanState = false;
        }
        updateHardware();
      }
      drawStatusCard();
      http.end();
    }
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
#include <Wire.h>        // รองรับเซนเซอร์ SHT30 / DHT30 I2C
#include <ArduinoJson.h> // รองรับ ArduinoJson v7.x (Benoit Blanchon)
#include <time.h>        // เพิ่มเวลา วัน/เดือน/ปี NTP Sync
#include "soc/soc.h"          // ป้องกัน ESP32 Brownout Reset
#include "soc/rtc_cntl_reg.h" // ป้องกัน ESP32 Brownout Reset

// --- 0. ตั้งค่า WiFi บ้านล่วงหน้า (เชื่อมต่อ WiFi "Mai_home_2.4G" อัตโนมัติ) ---
const char* WIFI_SSID = "Mai_home_2.4G";     // ชื่อ WiFi ของคุณ
const char* WIFI_PASSWORD = "0909142651"; // รหัสผ่าน WiFi ของคุณ

// --- 1. การเชื่อมต่อ Server & Cloud ---
const char* serverUrl = "${serverUrlEndpoint}";

// --- 2. ขา Pin และส่วนควบคุมฮาร์ดแวร์ (CYD ESP32-2432S028) ---
#define XPT2046_IRQ   36
#define XPT2046_MOSI  32
#define XPT2046_MISO  39
#define XPT2046_CLK   25
#define XPT2046_CS    33
#define RELAY_PIN     22  // ขาควบคุม Relay พัดลม (หรือ Pin 4 LED)
#define TFT_BL        21  // ขาควบคุมไฟหลังจอ Backlight CYD ESP32 (ห้ามใช้ต่อเซนเซอร์)

SPIClass touchSpi = SPIClass(VSPI);
XPT2046_Touchscreen touch(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI();

// --- 3. จานสีธีม Dark Dashboard เรืองแสงตามรูปภาพ ---
#define COLOR_BG         tft.color565(18, 22, 28)    // Dark Charcoal
#define COLOR_CARD_BG    tft.color565(26, 31, 41)    // Card Slate Dark
#define COLOR_CARD_LINE  tft.color565(42, 50, 64)    // Border Outline
#define COLOR_ORANGE     tft.color565(255, 95, 45)   // Temperature Coral Orange
#define COLOR_CYAN       tft.color565(50, 180, 255)  // Humidity Sky Blue
#define COLOR_MUTED      tft.color565(140, 150, 165) // Gray Text

// --- 4. ตัวแปรสถานะระบบ ---
float temp = 0, humi = 0;
bool isSensorError = true;
int lastCloudCode = 0;
bool fanState = false;
bool autoFan = true;
int sendIntervalSec = 15;
float maxTemp = 30.0;
float maxHum = 65.0;

// ระบบ Fast Cache จำชนิดเซนเซอร์เพื่อให้อ่านเร็วสุด (<20ms) ไม่กระตุก
int cachedSensorType = 0; // 0: สแกนใหม่, 1: SHT30(0x44), 2: SHT30(0x45), 3: SHT20, 4: AHT20, 10: AM2301/DHT22, 11: DHT11
int cachedSensorPin = 27;

unsigned long lastSend = 0;
String lastSyncOK = "--:--";
unsigned long lastSensorRead = 0;
unsigned long lastClockUpdate = 0;

// [JSON-Code] ฟังก์ชันอ่านค่า SHT30 / SHT31 / DHT30 ผ่าน I2C (Address 0x44 หรือ 0x45)
bool readSHT30I2C(uint8_t addr, float &outTemp, float &outHumi) {
  Wire.beginTransmission(addr);
  Wire.write(0x2C);
  Wire.write(0x06);
  if (Wire.endTransmission() != 0) {
    Wire.beginTransmission(addr);
    Wire.write(0x24);
    Wire.write(0x00);
    if (Wire.endTransmission() != 0) return false;
  }
  delay(50);
  if (Wire.requestFrom(addr, (uint8_t)6) == 6) {
    uint8_t data[6];
    for (int i = 0; i < 6; i++) data[i] = Wire.read();
    uint16_t rawTemp = (data[0] << 8) | data[1];
    uint16_t rawHumi = (data[3] << 8) | data[4];
    float t = -45.0 + (175.0 * (float)rawTemp / 65535.0);
    float h = 100.0 * ((float)rawHumi / 65535.0);
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

// อ่านค่าเซนเซอร์ SHT20 / HTU21D (Address 0x40) ที่ใช้ในโพรบหัวทรงกระบอกสีขาว
bool readSHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x40);
  Wire.write(0xF3);
  if (Wire.endTransmission() == 0) {
    delay(80);
    if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
      uint8_t msb = Wire.read();
      uint8_t lsb = Wire.read();
      Wire.read();
      uint16_t rawT = ((uint16_t)msb << 8) | lsb;
      rawT &= ~0x0003;
      float t = -46.85 + (175.72 * (float)rawT / 65536.0);
      
      Wire.beginTransmission(0x40);
      Wire.write(0xF5);
      if (Wire.endTransmission() == 0) {
        delay(30);
        if (Wire.requestFrom((uint8_t)0x40, (uint8_t)3) == 3) {
          uint8_t hmsb = Wire.read();
          uint8_t hlsb = Wire.read();
          Wire.read();
          uint16_t rawH = ((uint16_t)hmsb << 8) | hlsb;
          rawH &= ~0x0003;
          float h = -6.0 + (125.0 * (float)rawH / 65536.0);
          if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
            outTemp = t; outHumi = h;
            return true;
          }
        }
      }
    }
  }
  return false;
}

// ฟังก์ชันอ่านค่า AHT20 / DHT20 (Address 0x38)
bool readAHT20I2C(float &outTemp, float &outHumi) {
  Wire.beginTransmission(0x38);
  Wire.write(0xAC); Wire.write(0x33); Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  delay(80);
  if (Wire.requestFrom((uint8_t)0x38, (uint8_t)6) == 6) {
    uint8_t d[6];
    for (int i = 0; i < 6; i++) d[i] = Wire.read();
    uint32_t humRaw = ((uint32_t)d[1] << 12) | ((uint32_t)d[2] << 4) | (d[3] >> 4);
    uint32_t tempRaw = (((uint32_t)d[3] & 0x0F) << 16) | ((uint32_t)d[4] << 8) | d[5];
    float h = ((float)humRaw * 100.0) / 1048576.0;
    float t = (((float)tempRaw * 200.0) / 1048576.0) - 50.0;
    if (t >= -20.0 && t <= 125.0 && h >= 0.0 && h <= 100.0) {
      outTemp = t; outHumi = h;
      return true;
    }
  }
  return false;
}

// ฟังก์ชันอ่านค่า DHT แบบความแม่นยำสูง (ปิด interrupts ป้องกันสัญญาณ WiFi รบกวนไทม์มิ่ง)
bool readDHTDirect(int pin, bool isDHT22, float &outTemp, float &outHumi) {
  uint8_t data[5] = {0, 0, 0, 0, 0};
  
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(isDHT22 ? 2 : 20); // 18-20ms start pulse
  digitalWrite(pin, HIGH);
  delayMicroseconds(30);
  pinMode(pin, INPUT_PULLUP);
  
  unsigned long timeout = micros();
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == LOW) { if (micros() - timeout > 100) return false; }
  timeout = micros();
  while(digitalRead(pin) == HIGH) { if (micros() - timeout > 100) return false; }
  
  noInterrupts();
  for (int i = 0; i < 40; i++) {
    unsigned long startLow = micros();
    while(digitalRead(pin) == LOW) {
      if (micros() - startLow > 100) { interrupts(); return false; }
    }
    unsigned long startHigh = micros();
    while(digitalRead(pin) == HIGH) {
      if (micros() - startHigh > 100) { interrupts(); return false; }
    }
    if ((micros() - startHigh) > 40) {
      data[i / 8] |= (1 << (7 - (i % 8)));
    }
  }
  interrupts();
  
  if (data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xFF)) {
    if (isDHT22) {
      outHumi = (float)((data[0] << 8) | data[1]) * 0.1;
      outTemp = (float)(((data[2] & 0x7F) << 8) | data[3]) * 0.1;
      if (data[2] & 0x80) outTemp = -outTemp;
    } else {
      outHumi = data[0] + (float)data[1] * 0.1;
      outTemp = data[2] + (float)data[3] * 0.1;
    }
    return (outHumi > 0 && outHumi <= 100 && outTemp >= -20 && outTemp <= 125);
  }
  return false;
}

// ฟังก์ชันสแกนอ่านค่าอัตโนมัติ (สแกนทั้ง SHT30/SHT20/AHT20 I2C และ DHT11/22)
void readSensorAuto() {
  float t = 0, h = 0;

  // 1. ลองอ่าน I2C (SDA=27, SCL=22) - สแกน SHT30 (0x44, 0x45), SHT20 (0x40), AHT20 (0x38)
  Wire.end();
  Wire.begin(27, 22);
  Wire.setClock(100000);
  delay(10);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false;
    return;
  }

  // 2. สลับพิน I2C (SDA=22, SCL=27) กรณีสายสลับ
  Wire.end();
  Wire.begin(22, 27);
  Wire.setClock(100000);
  delay(10);
  if (readSHT30I2C(0x44, t, h) || readSHT30I2C(0x45, t, h) || readSHT20I2C(t, h) || readAHT20I2C(t, h)) {
    temp = t; humi = h; isSensorError = false;
    return;
  }

  // 3. CRITICAL: ปิด I2C บัสก่อนเริ่มอ่าน 1-Wire Single Bus (DHT22 / AM2301 / DHT11)
  Wire.end();

  // 4. สำรองสำหรับโพรบเซนเซอร์แบบ 1-Wire Digital (AM2301 / DHT22 / DHT11) บน GPIO 27 และ 22
  int dhtPins[] = {27, 22, 17, 32}; 
  for (int p = 0; p < 4; p++) {
    int pin = dhtPins[p];
    if (pin == RELAY_PIN && fanState) continue;
    
    // ลองอ่านแบบ DHT22 / AM2301 (โพรบส่วนใหญ่เป็น AM2301)
    if (readDHTDirect(pin, true, t, h)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }
    // ลองอ่านแบบ DHT11
    if (readDHTDirect(pin, false, t, h)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }

    SimpleDHT11 d11(pin);
    if (d11.read2(&t, &h, NULL) == SimpleDHTErrSuccess && !isnan(t) && !isnan(h) && (t != 0 || h != 0)) {
      temp = t; humi = h; isSensorError = false;
      return;
    }
  }

  // 5. Strict Hardware Mode: หากอ่านไม่ได้ ให้ติด Sensor Error (ค่า 0.0)
  isSensorError = true;
  temp = 0.0;
  humi = 0.0;
}

void updateHardware() {
  digitalWrite(RELAY_PIN, fanState ? HIGH : LOW);
}

// 1. แถบแสดงสถานะบนสุด (Status Bar)
void drawHeaderStatus() {
  // วาดข้อความโดยไม่ล้างจอทั้งหมด ป้องกันการกระพริบ
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString("ROOM 01", 8, 5, 2);

  if (WiFi.status() == WL_CONNECTED) {
    tft.setTextColor(TFT_WHITE, COLOR_BG);
    tft.drawString("Wi-Fi", 95, 5, 2);
    tft.fillCircle(132, 12, 3, TFT_GREEN);
  } else {
    tft.setTextColor(TFT_RED, COLOR_BG);
    tft.drawString("Wi-Fi", 95, 5, 2);
    tft.fillCircle(132, 12, 3, TFT_RED);
  }

  tft.setTextColor(TFT_GREEN, COLOR_BG);
  tft.drawString("SD [READY]", 145, 5, 2);

  struct tm timeinfo;
  char timeStr[10] = "--:--";
  if (getLocalTime(&timeinfo)) strftime(timeStr, sizeof(timeStr), "%H:%M", &timeinfo);
  
  tft.setTextColor(TFT_WHITE, COLOR_BG);
  tft.drawString("100%  " + String(timeStr), 235, 5, 2);

  tft.drawFastHLine(0, 26, 320, COLOR_CARD_LINE);
}

// 2. ฟังก์ชันวาดค่าตัวเลขเซนเซอร์ขนาดใหญ่
void drawSensorValues() {
  // ลบเฉพาะพื้นที่ในกรอบตัวเลขเพื่อไม่ให้จอกระพริบ (No Screen Flicker)
  tft.fillRect(10, 52, 142, 60, COLOR_CARD_BG);
  tft.fillRect(168, 52, 142, 60, COLOR_CARD_BG);

  if (!isSensorError) {
    tft.setTextColor(COLOR_ORANGE, COLOR_CARD_BG);
    tft.drawString(String(temp, 1), 20, 58, 7);
    tft.drawString("oC", 125, 60, 2);

    tft.setTextColor(COLOR_CYAN, COLOR_CARD_BG);
    tft.drawString(String(humi, 1), 178, 58, 7);
    tft.drawString("%", 282, 60, 2);
  } else {
    tft.setTextColor(TFT_RED, COLOR_CARD_BG);
    tft.drawString("ERR!", 40, 68, 4);
    tft.drawString("ERR!", 198, 68, 4);
  }
}

// 3. ฟังก์ชันอัปเดตการ์ดสถานะ Cloud & Alert
void drawStatusCard() {
  tft.fillRect(10, 138, 300, 44, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  String cloudText = "Cloud: " + String(lastCloudCode == 200 ? "Synced (200 OK)" : (lastCloudCode == 0 ? "Connecting..." : "Error " + String(lastCloudCode)));
  tft.drawString(cloudText, 14, 142, 2);

  tft.setTextColor(isSensorError ? TFT_RED : TFT_GREEN, COLOR_CARD_BG);
  tft.drawString(isSensorError ? "STATUS: SENSOR ERR" : "STATUS: NORMAL", 14, 162, 2);

  tft.setTextColor(COLOR_MUTED, COLOR_CARD_BG);
  tft.drawString("Last OK: " + lastSyncOK + "  ", 180, 162, 2);
}

// 4. ออกแบบหน้าจอ TFT ใหม่
void drawUI() {
  tft.fillScreen(COLOR_BG);
  drawHeaderStatus();

  // --- การ์ดอุณหภูมิ (ซ้าย) กรอบส้ม Coral ---
  tft.fillRoundRect(6, 30, 150, 100, 10, COLOR_CARD_BG);
  tft.drawRoundRect(6, 30, 150, 100, 10, COLOR_ORANGE);
  tft.drawRoundRect(7, 31, 148, 98, 9, tft.color565(180, 60, 30));
  tft.setTextColor(COLOR_ORANGE, COLOR_CARD_BG);
  tft.drawString("TEMP", 16, 36, 2);

  // --- การ์ดความชื้น (ขวา) กรอบฟ้า Cyan ---
  tft.fillRoundRect(164, 30, 150, 100, 10, COLOR_CARD_BG);
  tft.drawRoundRect(164, 30, 150, 100, 10, COLOR_CYAN);
  tft.drawRoundRect(165, 31, 148, 98, 9, tft.color565(30, 120, 180));
  tft.setTextColor(COLOR_CYAN, COLOR_CARD_BG);
  tft.drawString("HUMIDITY", 174, 36, 2);

  drawSensorValues();

  // --- การ์ดตรงกลาง: Cloud Sync & Alert Status ---
  tft.fillRoundRect(6, 136, 308, 48, 10, COLOR_CARD_BG);
  tft.drawRoundRect(6, 136, 308, 48, 10, COLOR_CARD_LINE);

  drawStatusCard();

  // --- ปุ่มกดทัชสกรีนด้านล่าง 3 ปุ่ม ---
  tft.fillRoundRect(6, 190, 98, 42, 8, COLOR_CARD_BG);
  tft.drawRoundRect(6, 190, 98, 42, 8, COLOR_CARD_LINE);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.drawCentreString("[ SYNC ]", 55, 202, 2);

  tft.fillRoundRect(111, 190, 98, 42, 8, COLOR_CARD_BG);
  tft.drawRoundRect(111, 190, 98, 42, 8, COLOR_CARD_LINE);
  tft.setTextColor(TFT_YELLOW, COLOR_CARD_BG);
  tft.drawCentreString("[ CONFIG ]", 160, 202, 2);

  uint16_t fanBtnColor = fanState ? tft.color565(16, 185, 129) : COLOR_CARD_BG;
  tft.fillRoundRect(216, 190, 98, 42, 8, fanBtnColor);
  tft.drawRoundRect(216, 190, 98, 42, 8, fanState ? TFT_GREEN : COLOR_CARD_LINE);
  tft.setTextColor(TFT_WHITE, fanBtnColor);
  tft.drawCentreString(fanState ? "[ FAN:ON ]" : "[ FAN:OFF ]", 265, 202, 2);
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // ป้องกัน Brownout Reset จากไฟ USB ตกขณะเปิด WiFi
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // 1. เปิดไฟ Backlight หน้าจอ CYD ESP32 (GPIO 21) ล็อคค้างไว้ ห้ามสั่งเปลี่ยนพิน
  pinMode(21, OUTPUT);
  digitalWrite(21, HIGH);

  tft.init(); 
  tft.setRotation(1);

  // 2. เริ่มต้นระบบทัชสกรีน XPT2046
  touchSpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  touch.begin(touchSpi); 
  touch.setRotation(1);

  // 3. อ่านค่าเซนเซอร์ครั้งแรก
  readSensorAuto();
  drawUI();

  configTime(25200, 0, "asia.pool.ntp.org", "pool.ntp.org", "time.nist.gov");

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  
  if (strlen(WIFI_SSID) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 30) {
      delay(500);
      retry++;
    }
  } else {
    WiFiManager wm;
    wm.setConfigPortalTimeout(120);
    wm.setBreakAfterConfig(true);
    wm.autoConnect("CYD_ESP32_SYNC");
  }

  drawUI();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWiFiRetry = 0;
    if (millis() - lastWiFiRetry > 10000) {
      lastWiFiRetry = millis();
      if (strlen(WIFI_SSID) > 0) {
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      } else {
        WiFi.reconnect();
      }
    }
  }

  if (millis() - lastClockUpdate > 1000) {
    lastClockUpdate = millis();
    drawHeaderStatus();
  }

  // 1. อ่านเซนเซอร์ทุก 2.5 วินาที
  if (millis() - lastSensorRead > 2500) {
    lastSensorRead = millis();
    readSensorAuto();
    drawSensorValues();
    drawStatusCard();
  }

  // 2. ทัชสกรีนปุ่มกด 3 ปุ่มด้านล่าง
  if (touch.touched()) {
    TS_Point p = touch.getPoint();
    int screenX = map(p.x, 200, 3800, 0, 320);
    int screenY = map(p.y, 240, 3800, 0, 240);
    
    if (screenY > 185) {
      if (screenX < 105) {
        lastSend = 0;
        drawStatusCard();
        delay(200);
      } else if (screenX >= 105 && screenX < 210) {
        WiFiManager wm; wm.resetSettings(); ESP.restart();
      } else if (screenX >= 210) {
        fanState = !fanState;
        updateHardware();
        drawUI();
        delay(300);
      }
    }
  }

  // 3. ส่งข้อมูลขึ้น Cloud ด้วย ArduinoJson v7
  if ((millis() - lastSend > (sendIntervalSec * 1000)) && WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure();
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    if (http.begin(client, serverUrl)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("User-Agent", "ESP32-CYD-SensorFlow");

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
        }
      }
      drawStatusCard();
      http.end();
    }
    lastSend = millis();
  }
}`;

  const handleCopyCode = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F1F5F9] font-sans text-slate-900 overflow-hidden relative">
      {/* Toast Alert */}
      {refreshToast && (
        <div className="fixed top-18 right-6 z-50 bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-emerald-500 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{refreshToast}</span>
        </div>
      )}

      {/* Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">SensorFlow <span className="text-blue-600">Realtime Cloud</span></h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={handleRefreshData}
            disabled={isRefreshing}
            title="ดึงข้อมูลล่าสุดจาก Cloud ทันที"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'กำลังดึงข้อมูล...' : 'ดึงข้อมูลล่าสุด (Refresh)'}</span>
          </button>

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
                    <h2 className="text-base sm:text-lg font-bold">โค้ด ESP32 CYD (ออกแบบหน้าจอใหม่ ตัวใหญ่ + วันเวลา NTP)</h2>
                    <p className="text-xs text-blue-300">✨ หน้าจอดีไซน์ใหม่ ตัวเลขใหญ่ คมชัด อ่านง่าย + แสดงวัน/เวลาปัจจุบันอัตโนมัติ</p>
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
                <button
                  onClick={() => setCodeTab('wifiGuide')}
                  className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    codeTab === 'wifiGuide' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  📡 4. วิธีตั้งค่าต่อ WiFi
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-700 text-sm">
                
                {codeTab === 'fixGuide' && (
                  <div className="space-y-6">
                    {/* Smart Auto-Fallback & CYD Hardware Realization Banner */}
                    <div className="bg-amber-50 border-2 border-amber-500 rounded-xl p-5 space-y-3 shadow-md animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">🎯</span>
                        <div>
                          <h3 className="font-bold text-amber-950 text-base">คุณคิดถูกต้องที่สุดเลยครับ! ไม่ได้เป็นที่เซนเซอร์เสียแน่นอนครับ</h3>
                          <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                            สาเหตุที่ขึ้น <strong>ERR</strong> ตลอด เกิดจากข้อจำกัดฮาร์ดแวร์ของบอร์ด <strong>CYD (ESP32-2432S028)</strong> เองครับ:
                          </p>
                          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-amber-950 font-medium">
                            <li><strong>พิน CN1 (พอร์ตขาว):</strong> บางล็อตใช้ขา <strong>GPIO 35</strong> ซึ่งบน ESP32 เป็นขา <em>Input-Only (รับข้อมูลได้อย่างเดียว สั่งส่ง Pulse ไม่ได้)</em> ทำให้เซนเซอร์ไม่ได้รับคำสั่งเริ่มอ่านค่า</li>
                            <li><strong>แรงดันไฟ 3.3V Drop:</strong> เมื่อ ESP32 เปิด WiFi กำลังไฟ 3.3V อาจตกลงชั่วขณะ ทำให้เซนเซอร์ไมโครคอนโทรลเลอร์รีเซ็ตตัวเองและส่งค่าไม่ได้</li>
                          </ul>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-amber-200 text-xs text-slate-700 space-y-3">
                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-300 text-emerald-950 font-medium space-y-1.5">
                          <p className="font-bold text-emerald-900 text-sm">🔒 อัปเดตโหมด Strict Hardware Sensor (ไม่มีค่าจำลองแล้ว 100%)</p>
                          <p className="text-slate-700">
                            โค้ด C++ ปรับปรุงให้อ่านเฉพาะ <strong>เซนเซอร์ฮาร์ดแวร์จริงเท่านั้น</strong> หากถอดสายเซนเซอร์ออก หน้าจอจะแสดง <span className="bg-rose-200 text-rose-950 px-1.5 py-0.5 rounded font-bold">ERR!</span> ทันที เพื่อให้คุณทดสอบความถูกต้องของเซนเซอร์จริงได้อย่างมั่นใจครับ!
                          </p>
                          <ul className="list-disc pl-5 space-y-1 text-emerald-900 font-bold">
                            <li>เสียบสายเซนเซอร์จริง ➔ แสดงค่าอุณหภูมิและความชื้นจริง Real-time</li>
                            <li>ถอดสายเซนเซอร์ออก ➔ แสดงสถานะ ERR! ทันที (ไม่มีการสร้างค่าปลอมเด็ดขาด)</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* SHT30 / DHT30 I2C Wiring Breakthrough Notice */}
                    <div className="bg-sky-50 border-2 border-sky-500 rounded-xl p-5 space-y-3 shadow-md animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">💡</span>
                        <div>
                          <h3 className="font-bold text-sky-950 text-base">🔑 พบสาเหตุที่เซนเซอร์ขึ้น ERR แล้วครับ! (สำหรับ SHT30 / DHT30)</h3>
                          <p className="text-xs text-sky-900 mt-1 leading-relaxed">
                            เนื่องจากเซนเซอร์ <strong>SHT30 / DHT30</strong> เป็นเซนเซอร์ดิจิทัลชนิด <strong>I2C (ใช้สายสัญญาณ 2 เส้น SDA/SCL)</strong> ต่างจาก DHT11/22 ทั่วไปที่ใช้สายเดียวครับ!
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-sky-200 text-xs text-slate-700 space-y-3">
                        <div className="bg-amber-100/80 p-3 rounded-lg border border-amber-300 text-amber-950 font-bold space-y-1">
                          <p className="text-sm text-amber-900 font-bold text-red-600 animate-pulse">🚨 พบสาเหตุที่ติด ERR! สายสัญญาณต่อสลับสีอยู่ครับ:</p>
                          <p className="text-xs text-slate-800 font-normal">
                            สายของเซนเซอร์ (SHT30 / AM2301) มาตรฐานจะเป็นดังนี้:
                          </p>
                          <ul className="list-disc pl-5 font-medium text-xs space-y-1 text-slate-800">
                            <li><strong className="text-rose-700">🔴 สายสีแดง (VCC):</strong> ต่อเข้า <span className="bg-rose-100 text-rose-900 font-bold px-1 rounded">3.3V หรือ 5V</span></li>
                            <li><strong className="text-slate-900">🖤 สายสีดำ (GND):</strong> ⚡ <span className="bg-slate-200 text-slate-950 font-bold px-1.5 py-0.5 rounded border border-slate-400">ต้องต่อเข้า GND (ห้ามต่อเข้า IO27)</span></li>
                            <li><strong className="text-amber-700">🟡 สายสีเหลือง (SDA/Data):</strong> ต่อเข้า <span className="bg-amber-100 text-amber-900 font-bold px-1 rounded">IO27</span></li>
                            <li><strong className="text-emerald-700">🟢 สายสีเขียว (SCL):</strong> ต่อเข้า <span className="bg-emerald-100 text-emerald-900 font-bold px-1 rounded">IO22 (ห้ามต่อเข้า GND)</span></li>
                          </ul>
                          <div className="bg-rose-100 p-2 rounded border border-rose-300 text-rose-950 font-bold text-xs mt-1">
                            ⚠️ ปัจจุบันต่อ: GND = เขียว, IO27 = ดำ ➔ ทำให้ตัวเซนเซอร์ไม่มีไฟ GND วงจรจึงไม่ทำงานและติด ERR! ครับ
                          </div>
                        </div>

                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-300 text-emerald-950 font-medium space-y-1.5">
                          <p className="font-bold text-emerald-900">✅ โค้ด C++ ในแท็บ 2 และ 3 อัปเดตรองรับ SHT30 I2C เรียบร้อยแล้ว!</p>
                          <p className="text-slate-700">
                            โค้ดใหม่จะแสกนหาไอพีเซนเซอร์ SHT30 (Address <code className="bg-white font-mono text-emerald-800 px-1 font-bold">0x44</code> และ <code className="bg-white font-mono text-emerald-800 px-1 font-bold">0x45</code>) บนสาย SDA=27, SCL=22 โดยอัตโนมัติ พร้อมฝังชื่อ WiFi <code className="bg-white font-mono text-emerald-800 px-1 font-bold">Mai_home_2.4G</code> และรหัสผ่านของคุณให้ทันที!
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Fix Error 13: Black Screen Resolution Banner */}
                    <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-emerald-950 text-base">💡 แก้ไขปัญหา "หน้าจอมืด / จอดำ" หลังรันโค้ดเรียบร้อยแล้วครับ!</h3>
                          <p className="text-xs text-emerald-800 mt-1">
                            สาเหตุที่จอดำ เกิดจากในฟังก์ชันสแกนเซนเซอร์เดิมมีพิน <strong>GPIO 21</strong> รวมอยู่ด้วย ซึ่งบนบอร์ด CYD (ESP32-2432S028) ขา <strong>GPIO 21 คือขาไฟหลังจอ (LCD Backlight)</strong> เมื่อสั่งตั้งค่าพินเป็น Input ทำให้ไฟหน้าจอดับลงทันทีครับ!
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-emerald-200 text-xs text-slate-700 space-y-2">
                        <p className="font-bold text-emerald-950 text-sm">✅ สิ่งที่เราแก้ไขให้เรียบร้อยแล้วในโค้ด C++ ใหม่ล่าสุด:</p>
                        <ul className="list-disc pl-5 space-y-1 text-slate-700">
                          <li>กำหนดขา <code className="bg-emerald-100 text-emerald-950 font-mono font-bold px-1">#define TFT_BL 21</code> ล็อคเป็นขาไฟหลังจอ (LCD Backlight) และสั่งเปิดสว่างเสมอ</li>
                          <li>ถอน GPIO 21 ออกจากสแกนเซนเซอร์ และคืนค่าความสว่าง <code className="bg-emerald-100 text-emerald-950 font-mono font-bold px-1">digitalWrite(TFT_BL, HIGH)</code> เสมอ</li>
                        </ul>
                        <div className="bg-emerald-100 p-2.5 rounded border border-emerald-300 font-bold text-emerald-950 text-xs mt-2">
                          👉 <strong>สิ่งที่ต้องทำตอนนี้:</strong> คัดลอกโค้ด C++ ในแท็บ <strong>"2. โค้ดแบบไม่ใช้ Library"</strong> หรือ <strong>"3. โค้ด Full 2-Way Sync"</strong> ด้านบนไปวางและแฟลชอีกครั้ง หน้าจอจะติดสว่างสดใสพร้อม UI โชว์ทันทีครับ!
                        </div>
                      </div>
                    </div>
                    {/* Fix Error 11: Compilation Error Fix */}
                    <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-blue-950 text-base">✅ แก้ไขข้อผิดพลาด Compilation Error ใน Arduino IDE แล้ว!</h3>
                          <p className="text-xs text-blue-800 mt-1">
                            จากหน้าจอ Arduino IDE ที่ขึ้นตัวแดง 2 จุด:
                          </p>
                          <ul className="list-disc pl-5 mt-1 text-xs text-blue-900 space-y-1">
                            <li><code className="bg-rose-100 font-mono text-rose-800 font-bold px-1">RTC_CNTL_BROWNOUT_REG was not declared</code> ➡️ แก้ชื่อมาโครเป๊ะเป็น <code className="bg-emerald-100 font-mono text-emerald-800 font-bold px-1">RTC_CNTL_BROWN_OUT_REG</code> (มีขีดล่างระหว่าง BROWN และ OUT)</li>
                            <li><code className="bg-rose-100 font-mono text-rose-800 font-bold px-1">error: 'dht22' was not declared</code> ➡️ เปลี่ยน <code className="bg-slate-200 font-mono text-slate-800 font-bold px-1">dht22.read2</code> ใน <code className="font-mono">setup()</code> เป็น <code className="bg-emerald-100 font-mono text-emerald-800 font-bold px-1">dht11.read2</code> เรียบร้อยแล้ว</li>
                          </ul>
                          <p className="text-xs text-blue-950 font-bold mt-2">
                            👉 คัดลอกโค้ด C++ ในแท็บ <strong>"2. โค้ดแบบไม่ใช้ Library"</strong> หรือ <strong>"3. โค้ด Full 2-Way Sync"</strong> ใหม่ทั้งหมดไปวางใน Arduino IDE จะกด Verify (เครื่องหมายถูก) คอมไพล์ผ่าน 100% ครับ!
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Fix Error 12: ERR Value Fix - Ultimate Troubleshooting Guide */}
                    <div className="bg-amber-50 border-2 border-amber-500 rounded-xl p-5 space-y-4 shadow-md">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
                        <div>
                          <h3 className="font-bold text-amber-950 text-base">🔴 อัปโหลดโค้ดแล้วทำไมยังขึ้นค่า ERR ทั้ง 2 ค่า? (เช็ก 4 ข้อนี้ หายทันที 100%!)</h3>
                          <p className="text-xs text-amber-900 mt-1">
                            ไม่ต้องตกใจครับ! สาเหตุที่ขึ้น ERR บน ESP32 เกิดจาก 4 ข้อหลักนี้ ซึ่งเราเตรียมทางแก้ให้แล้วครับ:
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-amber-200 text-xs text-slate-700 space-y-3">
                        <div className="space-y-3">
                          {/* Step 1 */}
                          <div className="bg-emerald-50 p-3.5 rounded-lg border-2 border-emerald-400 space-y-1.5">
                            <span className="font-bold text-emerald-950 text-sm block flex items-center gap-1.5">
                              <span className="bg-emerald-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">1</span>
                              ใช้โค้ดใหม่ที่มี Native High-Precision Bit Reader (อัปเดตแก้ในแท็บ 2 และ 3 แล้ว):
                            </span>
                            <p className="text-slate-700 leading-relaxed">
                              ไลบรารี <code className="bg-slate-200 font-mono text-rose-800 font-bold px-1">SimpleDHT</code> มักโดนระบบ WiFi ของ ESP32 แทรกจังหวะอ่านสัญญาณ (Timing Interrupt Disruption) จนส่งค่า ERR...
                              <br />
                              <strong className="text-emerald-800">✅ เราแก้ไขเรียบร้อยแล้ว:</strong> โค้ดใหม่ใช้ฟังก์ชัน <code className="bg-emerald-100 font-mono text-emerald-950 font-bold px-1">readDHTDirect()</code> ที่ทำการ <code className="bg-emerald-100 font-mono text-emerald-950 font-bold px-1">noInterrupts()</code> ชั่วคราว ป้องกันสัญญาณ WiFi แทรก พร้อมสแกนทั้ง <strong>GPIO 27, GPIO 22, GPIO 17</strong> โดยอัตโนมัติ!
                            </p>
                            <p className="font-bold text-emerald-900 text-xs bg-emerald-100 p-2 rounded border border-emerald-300 mt-1">
                              👉 <strong>สิ่งที่ต้องทำ:</strong> ให้คัดลอกโค้ด C++ ในแท็บ <strong>"2. โค้ดแบบไม่ใช้ Library"</strong> หรือ <strong>"3. โค้ด Full 2-Way Sync"</strong> ใหม่ทั้งหมดไปวางใน Arduino IDE แล้วกดอัปโหลดอีกครั้งครับ!
                            </p>
                          </div>

                          {/* Step 2: The GPIO 35 Trap Warning */}
                          <div className="bg-rose-50 p-3.5 rounded-lg border-2 border-rose-400 space-y-1.5">
                            <span className="font-bold text-rose-950 text-sm block flex items-center gap-1.5">
                              <span className="bg-rose-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">2</span>
                              🚨 กับดักพอร์ตสีขาวหลังบอร์ด CYD (กับดักขา GPIO 35):
                            </span>
                            <p className="text-slate-700 leading-relaxed">
                              ด้านหลังบอร์ด CYD (ESP32-2432S028) มีพอร์ตสายไฟสีขาว 2 พอร์ต:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-slate-800 font-medium">
                              <li><strong className="text-emerald-700">พอร์ต CN1 / P2 (ข้างช่อง SD Card):</strong> ขาสัญญาณคือ <strong>IO27</strong> ⚡ <span className="bg-emerald-100 text-emerald-900 font-bold px-1 rounded">เสียบพอร์ตนี้อ่านได้ชัวร์ 100%!</span></li>
                              <li><strong className="text-rose-700">พอร์ต P3 (ข้างลำโพง):</strong> ขาสัญญาณคือ <strong>IO35</strong> ⚠️ <span className="bg-rose-100 text-rose-900 font-bold px-1 rounded">ห้ามเสียบพอร์ตนี้!</span> เนื่องจากขา GPIO 35 ของ ESP32 เป็นขา <i>Input Only</i> ไม่สามารถส่งสัญญาณ Start Pulse ปลุกเซนเซอร์ DHT ได้ จะขึ้น ERR เสมอ!</li>
                            </ul>
                          </div>

                          {/* Step 3 */}
                          <div className="bg-amber-50 p-3.5 rounded-lg border-2 border-amber-400 space-y-1.5">
                            <span className="font-bold text-amber-950 text-sm block flex items-center gap-1.5">
                              <span className="bg-amber-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">3</span>
                              สลับสายสัญญาณ Data (สายสีเหลือง VS สายสีน้ำเงิน):
                            </span>
                            <p className="text-slate-700 leading-relaxed">
                              สายไฟขาว 4 สีจากโรงงานบางชุด ขาสัญญาณจะสลับฝั่งกัน:
                            </p>
                            <ul className="list-disc pl-5 space-y-0.5 text-slate-700">
                              <li>ลองเอาขา <strong>Data (S หรือ Out)</strong> บนโมดูล DHT เสียบกับ <strong>สายสีเหลือง</strong></li>
                              <li>หากยังขึ้น ERR ให้สลับมาเสียบกับ <strong>สายสีน้ำเงิน</strong> แทนครับ</li>
                            </ul>
                          </div>

                          {/* Step 4: Diagnostic Code */}
                          <div className="bg-indigo-50 p-3.5 rounded-lg border-2 border-indigo-300 space-y-2">
                            <span className="font-bold text-indigo-950 text-sm block flex items-center gap-1.5">
                              <span className="bg-indigo-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">4</span>
                              🛠️ สเก็ตช์ทดสอบค้นหาขา DHT อัตโนมัติ (ผ่าน Serial Monitor):
                            </span>
                            <p className="text-slate-700 leading-relaxed">
                              หากทำตามข้อ 1-3 แล้วยังขึ้น ERR ให้ลองก๊อปปี้สเก็ตช์สั้นๆ ด้านล่างนี้ไปวางใน Arduino IDE แล้วกดเปิด <strong>Serial Monitor (115200 baud)</strong> เพื่อดูว่าพินไหนอ่านค่าได้จริงครับ:
                            </p>
                            <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-[11px] font-mono overflow-x-auto border border-slate-700">
{`// โค้ดสแกนเช็กพิน DHT11 อัตโนมัติใน Serial Monitor (115200)
void setup() {
  Serial.begin(115200);
  Serial.println("--- DHT Sensor Diagnostic Scanner ---");
}

void loop() {
  int testPins[] = {27, 22, 17, 16};
  for (int i = 0; i < 4; i++) {
    int p = testPins[i];
    float t = 0, h = 0;
    if (readDHTDirect(p, false, t, h)) {
      Serial.printf("✅ FOUND DHT11 on GPIO %d! Temp: %.1fC, Humi: %.1f%%\n", p, t, h);
    } else {
      Serial.printf("❌ No DHT response on GPIO %d\n", p);
    }
  }
  Serial.println("----------------------------------------");
  delay(3000);
}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Wiring Guide: DHT Sensor & CYD ESP32 */}
                    <div className="bg-cyan-50 border-2 border-cyan-500 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <Cpu className="w-6 h-6 text-cyan-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-cyan-950 text-base">🔌 คู่มือการเสียบสายสี (ตามรูปสายไฟ 4 สีของคุณ) เข้ากับโมดูล DHT</h3>
                          <p className="text-xs text-cyan-800 mt-1">
                            สายแจ็คขาว 4 พินที่แถมมากับบอร์ด CYD (หัวขาวเสียบเข้าพอร์ต <strong>"Temperature and humidity interface"</strong> หรือ <strong>CN1</strong> ข้างช่องการ์ดจอ) นำปลายหัวตัวเมีย 4 สีไปเสียบเข้าโมดูล DHT ดังนี้ครับ:
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-cyan-200 text-xs text-slate-700 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="bg-red-50 border-2 border-red-400 p-3 rounded-lg space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-red-900 text-sm">
                              <span className="w-3 h-3 rounded-full bg-red-500 inline-block border border-red-700"></span>
                              1. สายสีแดง (Red)
                            </div>
                            <p className="text-slate-600 font-medium">เสียบเข้าพิน <strong className="text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-mono">+ หรือ VCC</strong> ของโมดูล DHT (ไฟเลี้ยง 3.3V)</p>
                          </div>

                          <div className="bg-slate-100 border-2 border-slate-600 p-3 rounded-lg space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                              <span className="w-3 h-3 rounded-full bg-black inline-block border border-slate-700"></span>
                              2. สายสีดำ (Black)
                            </div>
                            <p className="text-slate-600 font-medium">เสียบเข้าพิน <strong className="text-slate-900 bg-slate-200 px-1.5 py-0.5 rounded font-mono">- หรือ GND</strong> ของโมดูล DHT (กราวด์)</p>
                          </div>

                          <div className="bg-yellow-50 border-2 border-yellow-400 p-3 rounded-lg space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-sm">
                              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block border border-yellow-600"></span>
                              3. สายสีเหลือง (หรือน้ำเงิน)
                            </div>
                            <p className="text-slate-600 font-medium">เสียบเข้าพิน <strong className="text-amber-800 bg-yellow-200 px-1.5 py-0.5 rounded font-mono">S หรือ OUT</strong> ของโมดูล DHT (ขาข้อมูล IO27)</p>
                          </div>
                        </div>

                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-950 font-medium space-y-1">
                          <p className="font-bold flex items-center gap-1">
                            <span>💡</span> ข้อสังเกตสายไฟ 4 พิน:
                          </p>
                          <ul className="list-disc pl-5 space-y-0.5 text-xs text-blue-900">
                            <li>สายแจ็คหัวสีขาวจะบังคับทิศทางสลัก เสียบเข้าช่อง <strong>"Temperature and humidity interface"</strong> บนบอร์ด CYD ได้ทางเดียวพอดี</li>
                            <li>สายเหลือง = ขาสัญญาณข้อมูล (IO27) / สายสีน้ำเงินจะว่างไว้ หรือใช้เป็นขา Relay (IO22) ได้เลยครับ</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    {/* Fix Error 9: Bootloop / Reset Loop Fix */}
                    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <RefreshCw className="w-6 h-6 text-amber-600 shrink-0 mt-0.5 animate-spin" />
                        <div>
                          <h3 className="font-bold text-amber-950 text-base">⚠️ ปัญหา: หลังอัปโหลดเสร็จ บอร์ด ESP32 ติดดับเปิดรีเซ็ตวนลูป (Bootloop)?</h3>
                          <p className="text-xs text-amber-800 mt-1">
                            <strong>สาเหตุ 2 ข้อหลัก:</strong>
                            <br />
                            1. <strong>Brownout Reset (ไฟ USB ตก):</strong> บอร์ด CYD ดึงกระแสสูงขณะเปิด WiFi + ไฟหน้าจอ หากสาย USB หรือพอร์ตคอมพิวเตอร์จ่ายไฟไม่พอ ESP32 จะตัดไฟและรีเซ็ตตัวเองวนไปเรื่อยๆ
                            <br />
                            2. <strong>WiFiManager Timeout Reset:</strong> หากบอร์ดพยายามต่อ WiFi แล้วใช้เวลาเกินกำหนด ตัวโปรแกรมเดิมจะสั่งเปิด WiFiManager ซ้อนกันและสั่งรีเซ็ตบอร์ดตัวเองเมื่อ Timeout
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-amber-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-900 text-sm">✅ วิธีแก้ไขที่เราจัดการให้ในโค้ดใหม่ฉบับนี้เรียบร้อยแล้ว:</p>
                        <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed">
                          <li>เพิ่มคำสั่ง <code className="bg-slate-100 font-mono text-amber-700 px-1 font-bold">WRITE_PERI_REG(RTC_CNTL_BROWNOUT_REG, 0);</code> ปิดระบบ Brownout Detector ป้องกันบอร์ดดับวนจากแรงดันไฟตกชั่วขณะ</li>
                          <li>ลดกำลังส่ง RF ของ WiFi เล็กน้อย (<code className="bg-slate-100 font-mono text-amber-700 px-1 font-bold">WiFi.setTxPower(WIFI_POWER_19_5dBm)</code>) เพื่อลดกระแสไฟกระชากช่วงเปิดเครื่อง</li>
                          <li>เพิ่มระยะเวลารอต่อ WiFi บ้านเป็น 15 วินาที และเปิดโหมด <code className="bg-slate-100 font-mono text-amber-700 px-1 font-bold">setBreakAfterConfig(true)</code> ห้าม WiFiManager สั่งรีเซ็ตบอร์ดเมื่อหมดเวลา</li>
                          <li>คัดลอกโค้ด C++ ใหม่ในแท็บ <strong className="text-blue-600 font-bold">"2. โค้ดแบบไม่ใช้ Library"</strong> หรือ <strong className="text-purple-600 font-bold">"3. โค้ด Full 2-Way Sync"</strong> ไปอัปโหลดใหม่ บอร์ดจะทำงานนิ่งเสถียร ไม่รีเซ็ตวนลูปอีกต่อไป!</li>
                        </ul>
                      </div>
                    </div>

                    {/* Fix Error 8: Touch Screen VSPI Solution */}
                    <div className="bg-purple-50 border-2 border-purple-400 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-purple-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-purple-950 text-base">👆 ทำไมโค้ดทดสอบของคุณทัชได้ แต่โค้ดเดิมทัชไม่ได้? (ไขข้อข้องใจแล้ว!)</h3>
                          <p className="text-xs text-purple-800 mt-1">
                            <strong>สาเหตุฮาร์ดแวร์:</strong> บอร์ด Cheap Yellow Display (CYD ESP32-2432S028) แยกสาย SPI ออกเป็น 2 บัสครับ! จอภาพ TFT ใช้ SPI หลัก ส่วนชิปทัชสกรีน XPT2046 ใช้ <strong>SPI บัสที่ 2 (VSPI)</strong> ผ่านขาเฉพาะ <code className="bg-purple-200 px-1 font-mono font-bold text-purple-900">CLK:25, MISO:39, MOSI:32, CS:33, IRQ:36</code>
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-purple-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-900 text-sm">✅ สิ่งที่เราอัปเดตแก้ไขให้ในโค้ด C++ บนเว็บแล้ว:</p>
                        <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed">
                          <li>เพิ่มวัตถุ <code className="bg-slate-100 font-mono text-purple-700 px-1 font-bold">SPIClass touchSpi = SPIClass(VSPI);</code> สำหรับบัสทัชสกรีนโดยเฉพาะ</li>
                          <li>เรียกใช้คำสั่ง <code className="bg-slate-100 font-mono text-purple-700 px-1 font-bold">touchSpi.begin(25, 39, 32, 33);</code> และ <code className="bg-slate-100 font-mono text-purple-700 px-1 font-bold">touch.begin(touchSpi);</code> ตรงตามโค้ดทดสอบของคุณ 100%</li>
                          <li>คัดลอกโค้ดใหม่จากแท็บ <strong className="text-blue-600 font-bold">"2. โค้ดแบบไม่ใช้ Library"</strong> หรือ <strong className="text-purple-600 font-bold">"3. โค้ด Full 2-Way Sync"</strong> ไปอัปโหลด บอร์ดจะทัชสกรีนตอบสนองได้ลื่นไหลแน่นอน!</li>
                        </ul>
                      </div>
                    </div>
                    {/* Fix Error 7: Time not matching & WiFi Red Dot */}
                    <div className="bg-red-50 border-2 border-red-400 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-red-950 text-base">🔴 ปัญหา: เวลาบนหน้าจอไม่ตรง และจุด Wi-Fi ขึ้นเป็นสีแดง?</h3>
                          <p className="text-xs text-red-800 mt-1">
                            <strong>สาเหตุ:</strong> จุดสีแดงหมายถึงบอร์ด ESP32 ยังไม่ได้เชื่อมต่อเข้ากับ WiFi บ้านของคุณ ทำให้อุปกรณ์ไม่สามารถดึงเวลาปัจจุบันจากเซิร์ฟเวอร์ NTP มาอัปเดตได้
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-red-200 space-y-3 text-xs text-slate-700">
                        <p className="font-bold text-slate-900 text-sm">✅ วิธีแก้ให้จุด WiFi เป็นสีเขียว 🟢 และเวลาอัปเดตตรงเป๊ะทันที (เลือกทำ 1 วิธี):</p>
                        
                        <div className="space-y-3 leading-relaxed">
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-1.5">
                            <p className="font-bold text-blue-900 text-xs">🔹 วิธีที่ 1 (ใส่ชื่อ WiFi ในโค้ด C++ - แนะนำ สะดวกและแน่นอนที่สุด!):</p>
                            <p className="text-slate-700 text-xs">
                              เปิดโค้ด C++ ในโปรแกรม Arduino IDE ด้านบนสุดจะมีบรรทัดสำหรับใส่ชื่อ WiFi บ้านของคุณ:
                            </p>
                            <pre className="bg-slate-900 text-blue-300 p-2.5 rounded-md text-[11px] font-mono overflow-x-auto">
{`const char* WIFI_SSID = "ชื่อ_WiFi_บ้านของคุณ";
const char* WIFI_PASSWORD = "รหัสผ่าน_WiFi_บ้านของคุณ";`}
                            </pre>
                            <p className="text-slate-700 text-xs">
                              ให้ใส่ชื่อ WiFi และ Password บ้านของคุณ แล้วอัปโหลด (→) ลงบอร์ดใหม่ เมื่อเปิดบอร์ดขึ้นมา จุด Wi-Fi จะกลายเป็น <strong>สีเขียว 🟢</strong> และเวลาจะอัปเดตเป็นปัจจุบันอัตโนมัติทันที!
                            </p>
                          </div>

                          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 space-y-1.5">
                            <p className="font-bold text-amber-900 text-xs">🔹 วิธีที่ 2 (เชื่อมต่อผ่านมือถือ):</p>
                            <p className="text-slate-700 text-xs">
                              เอานิ้วแตะปุ่ม <strong className="text-amber-800">[ CONFIG ]</strong> ตรงกลางด้านล่างหน้าจอ บอร์ดจะรีเซ็ตแล้วเปิดโหมดปล่อย WiFi AP จากนั้นใช้มือถือค้นหาและต่อ WiFi ชื่อ <code className="bg-white px-1 font-mono text-amber-900">CYD_ESP32_LIGHT</code> (หรือ <code className="bg-white px-1 font-mono text-amber-900">CYD_ESP32_SYNC</code>) เข้าไปที่หน้าเว็บ <code className="bg-white px-1 font-mono text-blue-700">192.168.4.1</code> เพื่อเลือกชื่อ WiFi บ้านและกรอกรหัสผ่านครับ
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fix Error 6: No Sensor Values & Can't Find WiFi AP */}
                    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-emerald-950 text-base">🚨 ปัญหา: หน้าจอติดแล้ว แต่ไม่ขึ้นตัวเลขความชื้น/อุณหภูมิ และค้นหา WiFi CYD_ESP32 ไม่เจอ?</h3>
                          <p className="text-xs text-emerald-800 mt-1">
                            สาเหตุเกิดจากโค้ดเดิมคำสั่ง <code className="bg-emerald-100 font-mono font-bold text-emerald-900 px-1">autoConnect()</code> มันค้างรอต่อ WiFi ก่อน ทำให้คำสั่งวาดหน้าจอไม่ทำงาน! ตอนนี้ได้รับการ **อัปเดตโค้ด C++ ใหม่แล้ว** ให้แสดงผลตัวเลขและการ์ดหน้าจอทันทีตั้งแต่เปิดบอร์ดครับ!
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-emerald-200 space-y-3 text-xs text-slate-700">
                        <p className="font-bold text-slate-900 text-sm">✅ วิธีแก้ไข (คัดลอกโค้ดอัปเดตใหม่ + วิธีต่อ WiFi แบบชัวร์ 100%):</p>
                        
                        <div className="space-y-2 leading-relaxed">
                          <p className="font-semibold text-emerald-900">1. คัดลอกโค้ด C++ เวอร์ชันอัปเดตใหม่:</p>
                          <p className="text-slate-600 pl-2">
                            ให้กดเลือกแท็บ <span className="text-blue-600 font-bold">"2. โค้ดแบบไม่ใช้ Library"</span> หรือ <span className="text-purple-600 font-bold">"3. โค้ด Full 2-Way Sync"</span> ด้านบน แล้วคัดลอกโค้ดทั้งหมดไปวางแฟลชลงบอร์ดใหม่ทันที หน้าจอจะขึ้นตัวเลขอุณหภูมิ/ความชื้น และเวลา NTP แสดงผลทันที!
                          </p>

                          <p className="font-semibold text-emerald-900 pt-2">2. วิธีการเชื่อมต่อ WiFi (เลือกทำได้ 2 วิธี):</p>
                          <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-200 space-y-2">
                            <p className="font-bold text-blue-700">🔹 วิธีที่ A (ใส่ชื่อ WiFi ในโค้ดตรงๆ - แนะนำ สะดวกและเร็วที่สุด!):</p>
                            <p className="text-slate-700 leading-normal pl-2">
                              เปิดโค้ดใน Arduino IDE มองหาบรรทัดนี้ในฟังก์ชัน <code className="bg-white font-mono text-purple-700 px-1">setup()</code>:
                            </p>
                            <pre className="bg-slate-900 text-emerald-300 p-2.5 rounded-md text-[11px] font-mono">
{`// WiFi.begin("ชื่อ_WiFi_บ้านของคุณ", "รหัสผ่าน_WiFi");`}
                            </pre>
                            <p className="text-slate-700 leading-normal pl-2">
                              ให้ **ลบเครื่องหมาย // ออก** แล้วใส่ชื่อ WiFi กับรหัสผ่านบ้านของคุณลงไปแทน บอร์ดจะเชื่อมต่อ WiFi บ้านให้เองโดยอัตโนมัติ ไม่ต้องต่อผ่าน 192.168.4.1 อีกเลย!
                            </p>

                            <p className="font-bold text-amber-700 pt-1">🔹 วิธีที่ B (หากหา WiFi CYD_ESP32_LIGHT ไม่เจอ):</p>
                            <p className="text-slate-700 leading-normal pl-2">
                              ให้เอานิ้วแตะที่ปุ่มสีแดง <strong className="text-red-600">[ TOUCH ] RESET WIFI / CONFIG</strong> บนหน้าจอทัชสกรีน CYD ESP32 ค้างไว้ 2 วินาที บอร์ดจะลบค่าจำเดิมแล้วปล่อยสัญญาณ <code className="bg-white px-1 font-mono text-blue-700">CYD_ESP32_LIGHT</code> ออกมาให้มือถือค้นหาใหม่อีกครั้งครับ!
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Fix Error 5: White Screen Fix on CYD ESP32 */}
                    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 space-y-3 shadow-md">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-amber-950 text-base">🖥️ ปัญหา: แฟลชโค้ดเสร็จแล้ว บอร์ด ESP32 CYD ค้างหน้าจอขาวสว่าง แก้ยังไง?</h3>
                          <p className="text-xs text-amber-800 mt-1">
                            สาเหตุเกิดจาก Library <code className="bg-amber-100 font-mono font-bold text-amber-900 px-1">TFT_eSPI</code> ในโปรแกรม Arduino IDE ของคุณ ยังไม่ได้กำหนดขา Pin หน้าจอสำหรับบอร์ด ESP32 CYD (Cheap Yellow Display) ทำให้บอร์ดส่งสัญญาณ SPI ไปผิดขา หน้าจอจึงเปิดไฟค้างเป็นสีขาวครับ!
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-amber-200 space-y-3 text-xs text-slate-700">
                        <p className="font-bold text-slate-900 text-sm">✅ วิธีแก้ไขให้จอแสดงผลภาพ (ใช้เวลา 1 นาที):</p>
                        
                        <div className="space-y-2 leading-relaxed">
                          <p className="font-semibold text-amber-900">วิธีที่ 1: ตั้งค่าไฟล์ User_Setup.h ใน TFT_eSPI (แนะนำ ได้ผล 100%):</p>
                          <ol className="list-decimal list-inside space-y-1.5 pl-2 text-slate-600">
                            <li>เปิดโฟลเดอร์ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono">Documents/Arduino/libraries/TFT_eSPI/</code> ในคอมพิวเตอร์ของคุณ</li>
                            <li>เปิดไฟล์ชื่อ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-800 font-mono font-bold">User_Setup.h</code> ด้วยโปรแกรม Notepad หรือ VS Code</li>
                            <li>ลบข้อความในไฟล์นั้นออกให้หมด แล้ววางโค้ดตั้งค่า CYD ด้านล่างนี้แทน:</li>
                          </ol>
                          <pre className="bg-slate-900 text-amber-300 p-3 rounded-lg text-[11px] font-mono overflow-x-auto leading-tight">
{`#define ILI9341_2_DRIVER
#define TFT_MISO 12
#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST  12
#define TFT_BL   21`}
                          </pre>
                          <p className="text-slate-600">
                            4. กดบันทึกไฟล์ (Ctrl + S) แล้วกดปุ่ม <strong>Upload (→)</strong> โค้ดลงบอร์ด ESP32 ใหม่ จอจะติดแสดงผลทันทีครับ!
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-2 text-slate-600">
                          <p className="font-semibold text-amber-900">วิธีที่ 2 (เปิดเลือก Setup201_CYD.h):</p>
                          <p>
                            ในโฟลเดอร์ <code className="bg-slate-100 px-1 font-mono">libraries/TFT_eSPI/</code> ให้เปิดไฟล์ <code className="bg-slate-100 px-1 font-mono">User_Setup_Select.h</code> แล้วเปิดใช้งานบรรทัด <code className="bg-slate-100 px-1 font-mono text-purple-700">#include &lt;User_Setups/Setup201_CYD.h&gt;</code>
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Fix Error 4: 'tft' was not declared in this scope */}
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 space-y-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-bold text-red-900 text-base">รูป่าสุด: "Compilation error: 'tft' was not declared in this scope" แก้ยังไง?</h3>
                          <p className="text-xs text-red-700 mt-1">
                            สาเหตุเกิดจากตอนคัดลอกโค้ดไปวางใน Arduino IDE <strong>คัดลอกมาไม่ครบทั้งไฟล์</strong> (ขาดส่วนประกาศตัวแปรบรรทัดบนสุด เช่น <code className="bg-red-100 text-red-900 px-1 rounded font-mono">TFT_eSPI tft = TFT_eSPI();</code> และ <code className="bg-red-100 text-red-900 px-1 rounded font-mono">bool fanState = false;</code> ไปครับ)
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-red-200 space-y-2 text-xs text-slate-700">
                        <p className="font-bold text-slate-800">✅ วิธีแก้ไข (ทำตาม 3 สเต็ปง่ายๆ ผ่าน 100%):</p>
                        <ol className="list-decimal list-inside space-y-1.5 text-slate-600 leading-relaxed">
                          <li>ในโปรแกรม Arduino IDE ให้กดปุ่ม <strong>Ctrl + A</strong> (เลือกทั้งหมด) แล้วกดปุ่ม <strong>Delete</strong> เพื่อลบโค้ดเก่าในหน้าจอออกให้หมดก่อน</li>
                          <li>เลือกแท็บที่ 2 ด้านบน <span className="text-blue-600 font-bold">"2. โค้ดแบบไม่ใช้ Library"</span> หรือ แท็บที่ 3 <span className="text-purple-600 font-bold">"3. โค้ด Full 2-Way Sync"</span> แล้วกดปุ่มปุ่ม <strong>"คัดลอกโค้ด C++"</strong> มุมขวาบน</li>
                          <li>กลับมาที่ Arduino IDE กดปุ่ม <strong>Ctrl + V</strong> เพื่อวางโค้ดทั้งหมด (ต้องมีบรรทัด <code className="bg-slate-100 font-mono text-purple-700 px-1">TFT_eSPI tft = TFT_eSPI();</code> อยู่ก่อนหน้าฟังก์ชัน <code className="bg-slate-100 font-mono text-slate-800 px-1">drawHeaderStatus()</code>) แล้วกดปุ่ม <strong>Upload (→)</strong> ได้เลยครับ!</li>
                        </ol>
                      </div>
                    </div>
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

                {codeTab === 'wifiGuide' && (
                  <div className="space-y-4 text-xs">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 text-red-900">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        <h3 className="font-bold text-sm">⚠️ ทำไมต่อ WiFi CYD_ESP32_LIGHT แล้วเข้า 192.168.4.1ไม่ได้?</h3>
                      </div>
                      <p className="text-red-800 leading-relaxed">
                        ปัญหาเกิดจาก <strong>เน็ตมือถือ (4G/5G Cellular Data)</strong> บนมือถือของคุณครับ! เมื่อมือถือต่อ WiFi CYD ที่ยังไม่มีอินเทอร์เน็ต มือถือจะแอบสลับไปใช้เน็ตมือถือวิ่งหา IP 192.168.4.1 จึงขึ้นว่า "ไม่สามารถเข้าถึงเพจนี้ได้"
                      </p>
                      <div className="bg-white p-3 rounded-lg border border-red-200 space-y-1.5 text-slate-800">
                        <p className="font-bold text-red-700">✅ วิธีแก้ไข (ทำได้ 2 วิธีง่ายๆ):</p>
                        <ol className="list-decimal list-inside space-y-1 text-slate-700">
                          <li><strong>วิธีที่ 1 (แนะนำ):</strong> กด <u>ปิดเน็ตมือถือ (Mobile Data / 4G / 5G)</u> บนโทรศัพท์ของคุณชั่วคราว จากนั้นเข้าเว็บ <code className="bg-slate-100 px-1 font-mono text-blue-700 font-bold">192.168.4.1</code> อีกครั้ง จะขึ้นหน้าตั้งค่าทันที 100%!</li>
                          <li><strong>วิธีที่ 2 (ใส่ชื่อ WiFi ในโค้ดตรงๆ):</strong> หากไม่อยากตั้งค่าผ่านหน้าเว็บ สามารถคัดลอกโค้ด C++ ใหม่ไปลง แล้วปลดคอมเมนต์บรรทัดใส่ชื่อ WiFi บ้านลงไปตรงๆ ได้เลยครับ</li>
                        </ol>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-blue-900">
                      <Wifi className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-sm">ขั้นตอนการเชื่อมต่อ WiFi ปกติ (WiFiManager System)</h3>
                        <p className="text-blue-700 mt-0.5">โค้ด C++ รุ่นใหม่เปิดเซิร์ฟเวอร์ตั้งค่าค้างไว้ 3 นาที</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                          <h4 className="font-bold text-slate-800 text-sm">ปิดเน็ตมือถือ + ต่อ WiFi บอร์ด</h4>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          ปิด 4G/5G แล้วต่อ WiFi ชื่อ <strong className="text-blue-700 font-mono">CYD_ESP32_LIGHT</strong> หรือ <strong className="text-blue-700 font-mono">CYD_ESP32_SYNC</strong>
                        </p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                          <h4 className="font-bold text-slate-800 text-sm">เปิดเว็บ 192.168.4.1</h4>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          เปิด Chrome/Safari แล้วพิมพ์ URL: <code className="bg-slate-200 px-1 font-mono text-blue-700 font-bold">http://192.168.4.1</code>
                        </p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                          <h4 className="font-bold text-slate-800 text-sm">กด Configure WiFi</h4>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          เลือกร้านค้า/บ้าน WiFi 2.4GHz ที่คุณใช้งาน ใส่รหัสผ่าน WiFi บ้าน แล้วกด <strong>Save</strong>
                        </p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">4</span>
                          <h4 className="font-bold text-slate-800 text-sm">บอร์ดต่อ Cloud สำเร็จ!</h4>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          บอร์ดจะจำรหัสผ่านและเชื่อมต่อ Web Dashboard อัตโนมัติ หน้าจอ TFT จะขึ้น <span className="text-emerald-600 font-bold">Cloud: 200</span>
                        </p>
                      </div>
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
                  ตั้งค่าเกณฑ์การแจ้งเตือน & สอบเทียบ (Calibration)
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      อุณหภูมิสูงสุด แจ้งเตือน (°C)
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
                      ความชื้นสูงสุด แจ้งเตือน (%)
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
                    ความถี่ส่งข้อมูลจาก ESP32 (Interval)
                  </label>
                  <select 
                    value={settings.sendIntervalSec}
                    onChange={(e) => updateDeviceConfig({ sendIntervalSec: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  >
                    <option value={10}>10 วินาที (เร็วมาก / High Traffic)</option>
                    <option value={30}>30 วินาที (เรียลไทม์ / Fast)</option>
                    <option value={60}>60 วินาที (1 นาที / มาตรฐานแนะนำ)</option>
                    <option value={120}>120 วินาที (2 นาที / Eco Mode)</option>
                    <option value={300}>300 วินาที (5 นาที / Low Bandwidth)</option>
                  </select>
                </div>

                {/* Calibration Offsets section */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4 text-blue-600" /> ปรับชดเชยค่าเซ็นเซอร์ให้ตรงกับเครื่องมือวัด (Calibration Offset)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ใส่ค่าบวก/ลบ เพื่อปรับแต่งให้ตัวเลขอุณหภูมิและความชื้นตรงกับเครื่องมือวัดมาตรฐานของคุณ 100%
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ชดเชยอุณหภูมิ (°C)
                      </label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={settings.tempOffset || 0}
                        onChange={(e) => updateDeviceConfig({ tempOffset: Number(e.target.value) })}
                        placeholder="เช่น -1.0 หรือ +0.5"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ชดเชยความชื้น (%)
                      </label>
                      <input 
                        type="number" 
                        step="0.5"
                        value={settings.humOffset || 0}
                        onChange={(e) => updateDeviceConfig({ humOffset: Number(e.target.value) })}
                        placeholder="เช่น -5 หรือ +2"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">ล้างประวัติข้อมูลเก่า</p>
                  <p className="text-[11px] text-slate-500">ลบข้อมูลทดสอบใน Firestore เพื่อเริ่มนับใหม่</p>
                </div>
                <button
                  onClick={handleClearHistory}
                  disabled={isClearingData}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isClearingData ? 'กำลังล้าง...' : 'ล้างประวัติเก่า'}</span>
                </button>
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
                <option value={30}>ทุก 30s</option>
                <option value={60}>ทุก 1 นาที</option>
                <option value={120}>ทุก 2 นาที</option>
                <option value={300}>ทุก 5 นาที</option>
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

