import { initializeApp, getApp, getApps } from 'firebase/app'; // Import getApp and getApps
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // Import getAuth

const firebaseConfig = {
  apiKey: 'AIzaSyCcGNgfhlKRKbLu_iHuIClQIi8iFjc-gJ4',
  authDomain: 'chatbot-e17e5.firebaseapp.com',
  projectId: 'chatbot-e17e5',
  storageBucket: 'chatbot-e17e5.firebasestorage.app',
  messagingSenderId: '645388218849',
  appId: '1:645388218849:web:bbc6138ecd13c8ff31e2a0',
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp(); // If already initialized, get the existing app
}

export const db = getFirestore(app);
export const auth = getAuth(app); // Initialize and export auth
