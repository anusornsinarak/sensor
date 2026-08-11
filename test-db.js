import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function checkData() {
  const q = query(collection(db, 'sensor_data'), orderBy('timestamp', 'desc'), limit(5));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(doc.id, " => ", data, "Time:", new Date(data.timestamp).toISOString());
  });
  process.exit(0);
}
checkData();
