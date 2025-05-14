import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminDbInstance: Firestore;

export function initializeAdminApp(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY,
      }),
    });
  }
  if (!adminDbInstance) {
    adminDbInstance = getFirestore();
  }
  return adminDbInstance;
}

// Optionally, export a pre-initialized instance for regular app use,
// but tests can choose to call initializeAdminApp or mock it.
export const adminDb = process.env.NODE_ENV === 'test' ? (undefined as any) : initializeAdminApp();
