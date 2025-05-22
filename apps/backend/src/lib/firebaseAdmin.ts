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

export function initializeAdminApp(): void {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      // If all specific environment variables are provided, use them
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // If GOOGLE_APPLICATION_CREDENTIALS is set, Firebase Admin SDK will use it automatically
      // You can also explicitly pass the path: initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) });
      // Or, more simply, just initializeApp() and let it auto-discover.
      initializeApp();
      console.log("Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.");
    } else {
      // Fallback or error if no credentials found
      // This will likely cause an error if Firebase services are accessed without proper init.
      // Consider throwing an explicit error here if credentials are vital for app start.
      console.warn(
        'Firebase Admin SDK: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are not all set, ' +
        'and GOOGLE_APPLICATION_CREDENTIALS is not set. Attempting default initialization.'
      );
      initializeApp(); // Attempt default initialization (e.g., for emulators or GCE environment)
    }
  }
}

// Initialize on module load
initializeAdminApp();

// Export a function to get the Firestore instance
// This ensures that getFirestore() is called after initializeApp()
export function getAdminDb(): Firestore {
  if (!adminDbInstance) {
    adminDbInstance = getFirestore();
  }
  return adminDbInstance;
}

// Export the pre-initialized instance for convenience.
// For tests, you might want to re-initialize or mock.
export const adminDb: Firestore = getAdminDb();
