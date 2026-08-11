import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, getDoc, doc } from 'firebase/firestore';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function checkData() {
  const configDoc = await getDoc(doc(db, 'device_settings', 'config'));
  console.log("Config:", configDoc.data());
  process.exit(0);
}
checkData();
