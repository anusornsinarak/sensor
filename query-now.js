import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const db = getFirestore(initializeApp(config), config.firestoreDatabaseId);
async function run() {
  const q = query(collection(db, 'sensor_data'), orderBy('timestamp', 'desc'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(d => console.log(new Date(d.data().timestamp).toISOString(), d.data()));
  process.exit(0);
}
run();
