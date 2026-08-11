import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function checkData() {
  try {
    const q = query(collection(db, 'sensor_data'), orderBy('timestamp', 'desc'), limit(5));
    const snapshot = await getDocs(q);
    console.log("Found", snapshot.size, "documents");
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(doc.id, " => ", data, "Time:", new Date(data.timestamp).toISOString());
    });
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
checkData();
