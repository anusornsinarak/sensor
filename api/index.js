// server.ts
import express from "express";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, deleteDoc, query, limit, where, orderBy } from "firebase/firestore";
import axios from "axios";

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "gen-lang-client-0516953163",
  appId: "1:427426951734:web:55262e3387d2e6f9da5e97",
  apiKey: "AIzaSyCXLGKCPAStDBt0RTcCUdX3ew4c_uB6oxs",
  authDomain: "gen-lang-client-0516953163.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-iotsensordashboa-6c74a260-d381-44d8-ae58-a587051c2d98",
  storageBucket: "gen-lang-client-0516953163.firebasestorage.app",
  messagingSenderId: "427426951734",
  measurementId: "",
  oAuthClientId: "427426951734-629ukl6al33j508sfj3sdf3pik6lh22q.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// server.ts
var firebaseApp = initializeApp(firebase_applet_config_default);
var db = getFirestore(firebaseApp, firebase_applet_config_default.firestoreDatabaseId);
var activeSettings = {
  maxTemp: 30,
  maxHum: 65,
  sendIntervalSec: 60,
  tempOffset: 0,
  humOffset: 0,
  lineToken: "",
  lineUserId: "",
  lineNotifyEnabled: false,
  updatedAt: Date.now()
};
var lastAlertTime = 0;
var ALERT_COOLDOWN_MS = 5 * 60 * 1e3;
var loadSettings = async () => {
  try {
    const configDoc = await getDoc(doc(db, "device_settings", "config"));
    if (configDoc.exists()) {
      activeSettings = { ...activeSettings, ...configDoc.data() };
      console.log("Loaded device settings from Firestore:", activeSettings);
    } else {
      await setDoc(doc(db, "device_settings", "config"), activeSettings);
    }
  } catch (err) {
    console.error("Error loading device settings:", err);
  }
};
loadSettings();
async function checkAndSendAlert(data) {
  if (!activeSettings.lineToken) {
    await loadSettings();
  }
  const cleanToken = (activeSettings.lineToken || "").trim();
  const cleanUserId = (activeSettings.lineUserId || "").trim();
  if (!activeSettings.lineNotifyEnabled || !cleanToken || !cleanUserId) return;
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) return;
  const isErr = data.sensor_error || data.temperature === 0 && data.humidity === 0;
  const isTempHigh = data.temperature > activeSettings.maxTemp;
  const isHumHigh = data.humidity > activeSettings.maxHum;
  let alertMessage = "";
  if (isErr) {
    alertMessage = "\u26A0\uFE0F [\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19] \u0E40\u0E0B\u0E19\u0E40\u0E0B\u0E2D\u0E23\u0E4C\u0E21\u0E35\u0E1B\u0E31\u0E0D\u0E2B\u0E32 (Sensor Error)\n\u{1F4A1} \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33: \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E2A\u0E32\u0E22\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E35\u0E2A\u0E15\u0E32\u0E23\u0E4C\u0E17\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E04\u0E23\u0E31\u0E1A";
  } else if (isTempHigh && isHumHigh) {
    alertMessage = `\u{1F6A8} [\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19] \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E41\u0E25\u0E30\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E2A\u0E39\u0E07\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E17\u0E31\u0E49\u0E07\u0E04\u0E39\u0E48!

\u{1F321}\uFE0F \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.temperature.toFixed(1)}\xB0C (\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14: ${activeSettings.maxTemp}\xB0C)
\u{1F4A6} \u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.humidity.toFixed(1)}% (\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14: ${activeSettings.maxHum}%)

\u{1F4A1} \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E34\u0E14\u0E23\u0E30\u0E1A\u0E1A\u0E23\u0E30\u0E1A\u0E32\u0E22\u0E2D\u0E32\u0E01\u0E32\u0E28 \u0E41\u0E25\u0E30\u0E40\u0E1B\u0E34\u0E14\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E14\u0E39\u0E14\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E04\u0E23\u0E31\u0E1A`;
  } else if (isTempHigh) {
    alertMessage = `\u{1F525} [\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19] \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E2A\u0E39\u0E07\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14!

\u{1F321}\uFE0F \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.temperature.toFixed(1)}\xB0C (\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14: ${activeSettings.maxTemp}\xB0C)
\u{1F4A6} \u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.humidity.toFixed(1)}%

\u{1F4A1} \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E34\u0E14\u0E1E\u0E31\u0E14\u0E25\u0E21\u0E23\u0E30\u0E1A\u0E32\u0E22\u0E2D\u0E32\u0E01\u0E32\u0E28 \u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E1B\u0E34\u0E14\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E1B\u0E23\u0E31\u0E1A\u0E2D\u0E32\u0E01\u0E32\u0E28\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E25\u0E14\u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E04\u0E23\u0E31\u0E1A`;
  } else if (isHumHigh) {
    alertMessage = `\u{1F4A7} [\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19] \u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E2A\u0E39\u0E07\u0E40\u0E01\u0E34\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14!

\u{1F321}\uFE0F \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.temperature.toFixed(1)}\xB0C
\u{1F4A6} \u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: ${data.humidity.toFixed(1)}% (\u0E40\u0E01\u0E13\u0E11\u0E4C\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14: ${activeSettings.maxHum}%)

\u{1F4A1} \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33: \u0E04\u0E27\u0E23\u0E40\u0E1B\u0E34\u0E14\u0E1E\u0E31\u0E14\u0E25\u0E21\u0E14\u0E39\u0E14\u0E2D\u0E32\u0E01\u0E32\u0E28 \u0E2B\u0E23\u0E37\u0E2D\u0E43\u0E0A\u0E49\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E14\u0E39\u0E14\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19\u0E04\u0E23\u0E31\u0E1A`;
  }
  if (alertMessage) {
    try {
      await axios.post("https://api.line.me/v2/bot/message/push", {
        to: cleanUserId,
        messages: [{ type: "text", text: alertMessage }]
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanToken}`
        }
      });
      console.log("Sent LINE OA Alert:", alertMessage);
      lastAlertTime = now;
    } catch (err) {
      console.error("Failed to send LINE OA alert:", err?.response?.data || err?.message || err);
    }
  }
}
async function startServer() {
  const app = express();
  const PORT = 3e3;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.text({ type: "*/*" }));
  app.get("/api/device-config", (req, res) => {
    res.json(activeSettings);
  });
  app.get("/api/export-csv", async (req, res) => {
    try {
      const q = query(collection(db, "sensor_data"), orderBy("timestamp", "desc"), limit(1e4));
      const snap = await getDocs(q);
      const rows = [
        ["Timestamp", "Date", "Time", "Temperature (\xB0C)", "Humidity (%)", "Status"].join(",")
      ];
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const dt = new Date(d.timestamp);
        const dateStr = dt.toISOString().split("T")[0];
        const timeStr = dt.toTimeString().split(" ")[0];
        const isErr = d.sensor_error || d.temperature === 0 && d.humidity === 0;
        rows.push([
          d.timestamp,
          dateStr,
          timeStr,
          d.temperature,
          d.humidity,
          isErr ? "SENSOR_FAULT" : "OK"
        ].join(","));
      });
      const csvString = "\uFEFF" + rows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="sensor_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csvString);
    } catch (err) {
      console.error("Error generating CSV export:", err);
      res.status(500).send("Error generating CSV export");
    }
  });
  app.post("/api/send-line-backup", async (req, res) => {
    try {
      await loadSettings();
      const cleanToken = (activeSettings.lineToken || "").trim();
      const cleanUserId = (activeSettings.lineUserId || "").trim();
      if (!cleanToken || !cleanUserId) {
        res.status(400).json({ error: "LINE Token or User ID is not configured" });
        return;
      }
      const host = req.headers["x-forwarded-host"] || req.headers.host || "sensor-five-liard.vercel.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const downloadUrl = `${proto}://${host}/api/export-csv`;
      const q = query(collection(db, "sensor_data"), orderBy("timestamp", "desc"), limit(1e4));
      const snap = await getDocs(q);
      const msg = `\u{1F4C1} [\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 CSV \u0E40\u0E02\u0E49\u0E32 LINE]

\u{1F4CA} \u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14: ${snap.size} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23

\u{1F4E5} \u0E04\u0E38\u0E13\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E01\u0E14\u0E17\u0E35\u0E48\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C CSV (\u0E40\u0E1B\u0E34\u0E14\u0E14\u0E39\u0E43\u0E19 Excel) \u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49\u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A:

\u{1F517} ${downloadUrl}`;
      await axios.post("https://api.line.me/v2/bot/message/push", {
        to: cleanUserId,
        messages: [{ type: "text", text: msg }]
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanToken}`
        }
      });
      res.json({ success: true, message: "\u0E2A\u0E48\u0E07\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E02\u0E49\u0E32 LINE \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27" });
    } catch (err) {
      console.error("Error sending LINE backup:", err?.response?.data || err?.message || err);
      res.status(500).json({ error: "Failed to send backup to LINE" });
    }
  });
  app.post("/api/cleanup-old-data", async (req, res) => {
    try {
      await loadSettings();
      const host = req.headers["x-forwarded-host"] || req.headers.host || "sensor-five-liard.vercel.app";
      const proto = req.headers["x-forwarded-proto"] || "https";
      const downloadUrl = `${proto}://${host}/api/export-csv`;
      const cleanToken = (activeSettings.lineToken || "").trim();
      const cleanUserId = (activeSettings.lineUserId || "").trim();
      const days = Number(req.body?.days || 365);
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1e3;
      const qOld = query(collection(db, "sensor_data"), where("timestamp", "<", cutoffMs), limit(500));
      const oldSnap = await getDocs(qOld);
      const countToDelete = oldSnap.docs.length;
      if (cleanToken && cleanUserId) {
        const backupNoticeMsg = `\u{1F9F9} [\u0E23\u0E30\u0E1A\u0E1A\u0E2A\u0E33\u0E23\u0E2D\u0E07 & \u0E25\u0E49\u0E32\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E22\u0E49\u0E2D\u0E19\u0E2B\u0E25\u0E31\u0E07 ${days} \u0E27\u0E31\u0E19]

\u0E1E\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E01\u0E48\u0E32\u0E40\u0E01\u0E34\u0E19 ${days} \u0E27\u0E31\u0E19 \u0E08\u0E33\u0E19\u0E27\u0E19: ${countToDelete} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23

\u{1F4E5} \u0E23\u0E30\u0E1A\u0E1A\u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E44\u0E1F\u0E25\u0E4C CSV \u0E43\u0E2B\u0E49\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49\u0E01\u0E48\u0E2D\u0E19\u0E25\u0E1A\u0E41\u0E25\u0E49\u0E27\u0E04\u0E23\u0E31\u0E1A:
\u{1F517} ${downloadUrl}

\u2705 \u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E25\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E01\u0E48\u0E32\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E04\u0E37\u0E19\u0E1E\u0E37\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27`;
        await axios.post("https://api.line.me/v2/bot/message/push", {
          to: cleanUserId,
          messages: [{ type: "text", text: backupNoticeMsg }]
        }, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cleanToken}`
          }
        }).catch((e) => console.error("Failed to notify LINE before cleanup:", e));
      }
      const deletePromises = oldSnap.docs.map((docSnap) => deleteDoc(doc(db, "sensor_data", docSnap.id)));
      await Promise.all(deletePromises);
      res.json({ success: true, deletedCount: countToDelete, message: `\u0E25\u0E49\u0E32\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E01\u0E48\u0E32\u0E01\u0E27\u0E48\u0E32 ${days} \u0E27\u0E31\u0E19 \u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27\u0E08\u0E33\u0E19\u0E27\u0E19 ${countToDelete} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23` });
    } catch (err) {
      console.error("Error in cleanup-old-data:", err);
      res.status(500).json({ error: "Failed to cleanup old data" });
    }
  });
  app.post("/api/line-webhook", async (req, res) => {
    try {
      await loadSettings();
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
        }
      }
      if (body && body.events && Array.isArray(body.events)) {
        for (const event of body.events) {
          const cleanToken = (activeSettings.lineToken || "").trim();
          let targetId = "";
          if (event.source) {
            if (event.source.type === "group" && event.source.groupId) {
              targetId = event.source.groupId;
            } else if (event.source.type === "user" && event.source.userId) {
              targetId = event.source.userId;
            }
          }
          if (targetId && activeSettings.lineUserId !== targetId) {
            activeSettings.lineUserId = targetId;
            activeSettings.updatedAt = Date.now();
            try {
              await setDoc(doc(db, "device_settings", "config"), activeSettings, { merge: true });
              console.log("Successfully auto-captured LINE Target ID:", targetId);
              if (cleanToken) {
                await axios.post("https://api.line.me/v2/bot/message/push", {
                  to: targetId,
                  messages: [{ type: "text", text: "\u{1F7E2} \u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35\u0E04\u0E23\u0E31\u0E1A! \u0E23\u0E30\u0E1A\u0E1A Dashboard \u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27\n\n\u0E23\u0E30\u0E1A\u0E1A\u0E08\u0E30\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E48\u0E32\u0E40\u0E0B\u0E19\u0E40\u0E0B\u0E2D\u0E23\u0E4C\u0E17\u0E35\u0E48\u0E19\u0E35\u0E48\u0E04\u0E23\u0E31\u0E1A \u{1F4CA}" }]
                }, {
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${cleanToken}`
                  }
                });
              }
            } catch (err) {
              console.error("Error saving or replying to LINE Target:", err);
            }
          }
          if (event.type === "message" && event.message && event.message.type === "text") {
            const msgText = (event.message.text || "").trim().toLowerCase();
            const isCheckCommand = msgText.includes("check") || msgText.includes("\u0E40\u0E0A\u0E47\u0E04") || msgText.includes("\u0E40\u0E0A\u0E04") || msgText.includes("status") || msgText.includes("\u0E2A\u0E16\u0E32\u0E19\u0E30") || msgText.includes("\u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34") || msgText.includes("\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19") || msgText === "c";
            const isBackupCommand = msgText.includes("backup") || msgText.includes("csv") || msgText.includes("export") || msgText.includes("\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14") || msgText.includes("\u0E2A\u0E33\u0E23\u0E2D\u0E07") || msgText.includes("\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C") || msgText.includes("\u0E02\u0E2D\u0E44\u0E1F\u0E25\u0E4C");
            if (isCheckCommand) {
              try {
                const qLatest = query(collection(db, "sensor_data"), orderBy("timestamp", "desc"), limit(1));
                const snap = await getDocs(qLatest);
                let replyText = "";
                if (!snap.empty) {
                  const latestData = snap.docs[0].data();
                  const isErr = latestData.sensor_error || latestData.temperature === 0 && latestData.humidity === 0;
                  if (isErr) {
                    replyText = "\u26A0\uFE0F \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19: \u0E40\u0E0B\u0E19\u0E40\u0E0B\u0E2D\u0E23\u0E4C\u0E21\u0E35\u0E1B\u0E31\u0E0D\u0E2B\u0E32 (Sensor Error)\n\u{1F4A1} \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33: \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E2A\u0E32\u0E22\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D \u0E2B\u0E23\u0E37\u0E2D\u0E23\u0E35\u0E2A\u0E15\u0E32\u0E23\u0E4C\u0E17\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E04\u0E23\u0E31\u0E1A";
                  } else {
                    replyText = `\u{1F4CA} \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19:
\u{1F321}\uFE0F \u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34: ${latestData.temperature.toFixed(1)}\xB0C
\u{1F4A6} \u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19: ${latestData.humidity.toFixed(1)}%`;
                  }
                } else {
                  replyText = "\u274C \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E0B\u0E19\u0E40\u0E0B\u0E2D\u0E23\u0E4C\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A\u0E04\u0E23\u0E31\u0E1A";
                }
                if (cleanToken && event.replyToken) {
                  await axios.post("https://api.line.me/v2/bot/message/reply", {
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: replyText }]
                  }, {
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${cleanToken}`
                    }
                  });
                  console.log("Successfully replied to LINE command:", msgText);
                }
              } catch (err) {
                console.error("Error replying to check command:", err?.response?.data || err?.message || err);
              }
            } else if (isBackupCommand) {
              try {
                const host = req.headers["x-forwarded-host"] || req.headers.host || "sensor-five-liard.vercel.app";
                const proto = req.headers["x-forwarded-proto"] || "https";
                const downloadUrl = `${proto}://${host}/api/export-csv`;
                const qCount = query(collection(db, "sensor_data"), orderBy("timestamp", "desc"), limit(1e4));
                const snapCount = await getDocs(qCount);
                const replyText = `\u{1F4C1} [\u0E2A\u0E48\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E33\u0E23\u0E2D\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25 CSV]

\u{1F4CA} \u0E08\u0E33\u0E19\u0E27\u0E19\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A: ${snapCount.size} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23

\u{1F4E5} \u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E01\u0E14\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E1F\u0E25\u0E4C CSV \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E40\u0E1B\u0E34\u0E14\u0E14\u0E39\u0E43\u0E19 Excel \u0E44\u0E14\u0E49\u0E40\u0E25\u0E22\u0E04\u0E23\u0E31\u0E1A:

\u{1F517} ${downloadUrl}`;
                if (cleanToken && event.replyToken) {
                  await axios.post("https://api.line.me/v2/bot/message/reply", {
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: replyText }]
                  }, {
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${cleanToken}`
                    }
                  });
                  console.log("Successfully sent CSV backup link to LINE for command:", msgText);
                }
              } catch (err) {
                console.error("Error replying to backup command:", err?.response?.data || err?.message || err);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Webhook error:", e);
    }
    res.status(200).send("OK");
  });
  app.post("/api/device-config", async (req, res) => {
    const { maxTemp, maxHum, sendIntervalSec, tempOffset, humOffset, lineToken, lineUserId, lineNotifyEnabled } = req.body;
    if (maxTemp != null) activeSettings.maxTemp = Number(maxTemp);
    if (maxHum != null) activeSettings.maxHum = Number(maxHum);
    if (sendIntervalSec != null) activeSettings.sendIntervalSec = Number(sendIntervalSec);
    if (tempOffset != null) activeSettings.tempOffset = Number(tempOffset);
    if (humOffset != null) activeSettings.humOffset = Number(humOffset);
    if (lineToken !== void 0) activeSettings.lineToken = lineToken;
    if (lineUserId !== void 0) activeSettings.lineUserId = lineUserId;
    if (lineNotifyEnabled !== void 0) activeSettings.lineNotifyEnabled = Boolean(lineNotifyEnabled);
    activeSettings.updatedAt = Date.now();
    try {
      await setDoc(doc(db, "device_settings", "config"), activeSettings);
      res.json({ success: true, config: activeSettings });
    } catch (err) {
      console.error("Error updating settings in Firestore:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });
  app.post("/api/clear-sensor-data", async (req, res) => {
    try {
      const q = query(collection(db, "sensor_data"), limit(500));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(doc(db, "sensor_data", docSnap.id)));
      await Promise.all(deletePromises);
      res.json({ success: true, count: snapshot.docs.length });
    } catch (err) {
      console.error("Error clearing data:", err);
      res.status(500).json({ error: "Failed to clear data" });
    }
  });
  app.post("/api/sensor-data", async (req, res) => {
    let bodyData = req.body;
    if (typeof bodyData === "string") {
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
      res.status(400).json({ error: "Missing temperature or humidity" });
      return;
    }
    const tempNum = Number(temperature);
    const humNum = Number(humidity);
    const isError = Boolean(sensor_error) || tempNum === 0 && humNum === 0;
    let rawTs = bodyData?.timestamp || req.query?.timestamp;
    let finalTimestamp = Date.now();
    if (rawTs) {
      const parsedTs = Number(rawTs);
      if (!isNaN(parsedTs) && parsedTs > 0) {
        finalTimestamp = parsedTs < 1e10 ? parsedTs * 1e3 : parsedTs;
      }
    }
    const newData = {
      timestamp: finalTimestamp,
      temperature: tempNum,
      humidity: humNum,
      ...isError ? { sensor_error: true } : {}
    };
    activeSettings.updatedAt = Date.now();
    try {
      const docRef = await addDoc(collection(db, "sensor_data"), newData);
      await setDoc(doc(db, "device_settings", "config"), { ...activeSettings, lastSeen: Date.now() }, { merge: true });
      checkAndSendAlert(newData).catch((err) => console.error("Alert error:", err));
      res.json({
        success: true,
        id: docRef.id,
        data: newData,
        config: activeSettings
      });
    } catch (err) {
      console.error("Error saving data to Firestore:", err);
      res.status(500).json({ error: "Failed to save data" });
    }
  });
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  if (process.env.VERCEL) {
    return app;
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}
var appPromise = startServer();
var server_default = async (req, res) => {
  const app = await appPromise;
  return app(req, res);
};
export {
  server_default as default
};
//# sourceMappingURL=index.js.map
