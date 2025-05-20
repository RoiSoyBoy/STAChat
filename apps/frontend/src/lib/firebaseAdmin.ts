import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
// Import necessary types/values from firestore
import { 
    getFirestore, 
    Firestore, 
    Timestamp, 
    QueryDocumentSnapshot, 
    FieldValue 
} from 'firebase-admin/firestore';
import { getAuth as adminGetAuth } from 'firebase-admin/auth'; // Import getAuth
import { getStorage as adminGetStorage } from 'firebase-admin/storage'; // Import getStorage

let adminDbInstance: Firestore;

// Re-export getAuth, getFirestore, getStorage, and common types/values
export const getAuth = adminGetAuth;
export const getStorage = adminGetStorage; // Re-export getStorage
export { getFirestore, Timestamp, QueryDocumentSnapshot, FieldValue }; // Re-export getFirestore and types

export function initializeAdminApp(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Ensure private key newlines are handled correctly if coming from .env
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  if (!adminDbInstance) {
    // Use the re-exported getFirestore for internal consistency if needed,
    // or the direct import. Here, direct import is fine.
    adminDbInstance = getFirestore();
  }
  return adminDbInstance;
}

// Optionally, export a pre-initialized instance for regular app use,
// but tests can choose to call initializeAdminApp or mock it.
export const adminDb: Firestore = process.env.NODE_ENV === 'test' ? (undefined as any) : initializeAdminApp();
