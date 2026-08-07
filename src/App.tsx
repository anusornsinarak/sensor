import React, { useEffect, useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { Thermometer, Droplets, Settings, Activity, AlertTriangle, Cpu, Download } from 'lucide-react';
import { format } from 'date-fns';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

interface SensorData {
  id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
}

export default function App() {
  const [data, setData] = useState<SensorData[]>([]);
  const [timeRange, setTimeRange] = useState<'1H' | '24H' | '7D'>('1H');
  
  // Threshold settings
  const [thresholds, setThresholds] = useState({
    maxTemp: 30,
    maxHum: 65,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Fetch real-time data from Firestore
  useEffect(() => {
    // We only fetch the latest 1000 records to prevent memory issues in the browser
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
      
      // Sort ascending for the charts (oldest to newest)
      sensorReadings.sort((a, b) => a.timestamp - b.timestamp);
      setData(sensorReadings);
    }, (error) => {
      console.error("Firestore real-time subscription error:", error);
    });

    return () => unsubscribe();
  }, []);

  const exportToCSV = () => {
    if (data.length === 0) return;
    
    const headers = ['Timestamp', 'Date', 'Time', 'Temperature (°C)', 'Humidity (%)'];
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
      const date = new Date(row.timestamp);
      const rowData = [
        row.timestamp,
        format(date, 'yyyy-MM-dd'),
        format(date, 'HH:mm:ss'),
        row.temperature,
        row.humidity
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

  // Alerts logic
  const activeAlerts = useMemo(() => {
    if (!latestData) return [];
    const alerts = [];
    if (latestData.temperature > thresholds.maxTemp) {
      alerts.push(`อุณหภูมิสูงเกินกำหนด! (${latestData.temperature}°C)`);
    }
    if (latestData.humidity > thresholds.maxHum) {
      alerts.push(`ความชื้นสูงเกินกำหนด! (${latestData.humidity}%)`);
    }
    return alerts;
  }, [latestData, thresholds]);

  return (
    <div className="flex flex-col h-screen bg-[#F1F5F9] font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">SensorFlow <span className="text-blue-600">Real-time</span></h1>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <button 
            onClick={exportToCSV}
            title="Export CSV"
            className="flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
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
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold tracking-wider">ESP32 CONNECTED</span>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">อัปเดตล่าสุด</p>
            <p className="text-sm font-mono">{latestData ? format(new Date(latestData.timestamp), 'HH:mm:ss') : '--:--:--'}</p>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex p-4 sm:p-6 gap-6 overflow-hidden relative max-w-[1600px] mx-auto w-full">
        
        {/* Settings Overlay */}
        {showSettings && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6 bg-slate-900/20 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-500" />
                  ตั้งค่าการแจ้งเตือน (Thresholds)
                </h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    อุณหภูมิสูงสุด (°C)
                  </label>
                  <input 
                    type="number" 
                    value={thresholds.maxTemp}
                    onChange={(e) => setThresholds({...thresholds, maxTemp: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    ความชื้นสูงสุด (%)
                  </label>
                  <input 
                    type="number" 
                    value={thresholds.maxHum}
                    onChange={(e) => setThresholds({...thresholds, maxHum: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-slate-800">
                  <Cpu className="w-4 h-4" /> วิธีเชื่อมต่อ ESP32
                </h3>
                <p className="text-sm text-slate-600 mb-2">
                  ส่งข้อมูล HTTP POST มาที่ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-600 text-xs font-mono">/api/sensor-data</code> พร้อม Payload JSON:
                </p>
                <pre className="bg-slate-800 text-slate-50 p-3 rounded-lg text-xs overflow-x-auto">
{`{
  "temperature": 25.5,
  "humidity": 60.2
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-6 h-full shrink-0 overflow-y-auto hidden md:flex">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm shrink-0">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">ค่าปัจจุบัน (Current Status)</h2>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm text-blue-600 font-medium mb-1">อุณหภูมิ (Temperature)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-800">{latestData ? latestData.temperature.toFixed(1) : '--'}</span>
                  <span className="text-xl text-slate-500 font-medium">°C</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600">
                  {latestData && latestData.temperature > thresholds.maxTemp ? (
                    <><AlertTriangle className="w-3 h-3 text-red-600" /><span className="text-red-600">เกินกำหนด! (High)</span></>
                  ) : (
                    <><Thermometer className="w-3 h-3" /><span>ปกติ (Normal)</span></>
                  )}
                </div>
              </div>

              <div className="p-4 bg-teal-50 rounded-xl border border-teal-100">
                <p className="text-sm text-teal-600 font-medium mb-1">ความชื้น (Humidity)</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-800">{latestData ? latestData.humidity.toFixed(1) : '--'}</span>
                  <span className="text-xl text-slate-500 font-medium">%</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-teal-600">
                  {latestData && latestData.humidity > thresholds.maxHum ? (
                    <><AlertTriangle className="w-3 h-3 text-red-600" /><span className="text-red-600">เกินกำหนด! (High)</span></>
                  ) : (
                    <><Droplets className="w-3 h-3" /><span>เหมาะสม (Optimal)</span></>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex-1 flex flex-col min-h-[200px]">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">ระบบแจ้งเตือน (Alerts Log)</h2>
            <div className="space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-thin">
              {activeAlerts.length > 0 ? (
                activeAlerts.map((alert, idx) => (
                  <div key={idx} className="flex gap-3 p-2 bg-red-50 border-l-4 border-red-500 rounded text-sm">
                    <div className="text-red-600 shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                    <div>
                      <p className="font-bold text-red-800">แจ้งเตือน!</p>
                      <p className="text-xs text-red-600">{alert}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex gap-3 p-2 bg-slate-50 border-l-4 border-slate-300 rounded text-sm">
                  <div className="text-slate-400 shrink-0"><Activity className="w-5 h-5" /></div>
                  <div>
                    <p className="font-bold text-slate-700">ระบบทำงานปกติ</p>
                    <p className="text-xs text-slate-500">รอรับข้อมูลใหม่จากเซ็นเซอร์</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Charts Section */}
        <section className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto md:overflow-hidden min-w-0">
          
          {/* Mobile Current Stats (only visible on small screens) */}
          <div className="md:hidden grid grid-cols-2 gap-4 shrink-0">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-1">อุณหภูมิ</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{latestData ? latestData.temperature.toFixed(1) : '--'}</span>
                <span className="text-sm font-medium text-slate-500">°C</span>
              </div>
            </div>
            <div className="bg-teal-50 rounded-xl p-4 border border-teal-100">
              <p className="text-xs text-teal-600 font-medium mb-1">ความชื้น</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{latestData ? latestData.humidity.toFixed(1) : '--'}</span>
                <span className="text-sm font-medium text-slate-500">%</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[300px]">
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
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm text-slate-400 font-medium hidden sm:block">ขีดจำกัดแจ้งเตือน: <span className="text-red-500">{'>'} {thresholds.maxTemp}°C</span></div>
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
                    <ReferenceLine y={thresholds.maxTemp} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#2563EB" 
                      strokeWidth={3} 
                      dot={false}
                      activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                      name="อุณหภูมิ"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400"><Activity className="w-8 h-8 opacity-20 mr-2"/> รอข้อมูล...</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col flex-1 min-h-[300px]">
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
                          ? 'bg-teal-600 text-white' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-sm text-slate-400 font-medium hidden sm:block">ขีดจำกัดแจ้งเตือน: <span className="text-red-500">{'>'} {thresholds.maxHum}%</span></div>
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
                    <ReferenceLine y={thresholds.maxHum} stroke="#ef4444" strokeDasharray="4 4" opacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#0D9488" 
                      strokeWidth={3} 
                      dot={false}
                      activeDot={{ r: 6, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                      name="ความชื้น"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400"><Activity className="w-8 h-8 opacity-20 mr-2"/> รอข้อมูล...</div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
