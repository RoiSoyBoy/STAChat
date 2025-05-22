// clearFirestoreData.ts
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

// Load environment variables from apps/backend/.env
dotenv.config({ path: path.resolve(__dirname, 'apps/backend/.env') });

// Import using a relative path from the root, assuming this script is in the root
// If ts-node is configured with the backend's tsconfig, aliases might work,
// but a direct relative path is safer for a root script.
import { initializeAdminApp, adminDb } from './apps/backend/src/lib/firebaseAdmin';

// Ensure Firebase Admin is initialized before trying to use adminDb
initializeAdminApp();

const USER_ID_TO_CLEAR = process.env.TEST_USER_ID || 'test-user'; // Allow override via .env

// Helper function to delete all documents in a collection
async function deleteCollection(collectionPath: string, batchSize = 50) {
  const collectionRef = adminDb.collection(collectionPath);
  let query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject, 0);
  });
}

async function deleteQueryBatch(query: FirebaseFirestore.Query, resolve: (value: unknown) => void, reject: (reason?: any) => void, docsDeleted: number) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      console.log(`Successfully deleted ${docsDeleted} documents from ${(query as any)._queryOptions.collectionId}.`);
      resolve(docsDeleted);
      return;
    }

    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    const numDeletedInBatch = snapshot.size;
    docsDeleted += numDeletedInBatch;
    process.stdout.write(`Deleted ${docsDeleted} documents so far from ${(query as any)._queryOptions.collectionId}...\r`);

    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject, docsDeleted);
    });
  } catch (err) {
    console.error(`Error deleting batch from ${(query as any)._queryOptions.collectionId}:`, err);
    reject(err);
  }
}

async function performFirestoreClear() {
  try {
    console.log("Starting Firestore data deletion...");

    const collectionsToClearCompletely = ['web_uploads', 'training'];
    for (const collection of collectionsToClearCompletely) {
      console.log(`\nDeleting all documents from '${collection}' collection...`);
      await deleteCollection(collection);
    }

    const userSpecificCollections = [
      { base: 'trainingEmbeddings', sub: 'qas' },
      { base: 'users', sub: 'urls' },
      // Add other user-specific collections here if needed
      // e.g. { base: 'users', sub: 'messages'}
    ];

    for (const { base, sub } of userSpecificCollections) {
      const userSpecificPath = `${base}/${USER_ID_TO_CLEAR}/${sub}`;
      console.log(`\nDeleting documents from '${userSpecificPath}'...`);
      await deleteCollection(userSpecificPath);
    }
    
    // Example: If you also have a top-level user-specific collection like 'user_chats/test-user/messages'
    // const userChatsMessagesPath = `user_chats/${USER_ID_TO_CLEAR}/messages`;
    // console.log(`\nDeleting documents from '${userChatsMessagesPath}'...`);
    // await deleteCollection(userChatsMessagesPath);


    console.log("\nFirestore data deletion process completed.");

  } catch (error) {
    console.error("\nAn error occurred during Firestore data deletion:", error);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.warn("\n!!! WARNING !!!");
console.warn("This script is configured to permanently delete data from your Firestore database.");
console.warn("It will target the following collections/paths:");
console.warn("  - ALL documents from 'web_uploads' collection.");
console.warn("  - ALL documents from 'training' collection.");
console.warn(`  - All documents from 'trainingEmbeddings/${USER_ID_TO_CLEAR}/qas'.`);
console.warn(`  - All documents from 'users/${USER_ID_TO_CLEAR}/urls'.`);
// Add other paths here if you extend the script
console.warn("\nThis action CANNOT be undone.");
console.warn("Please ensure your Firebase Admin SDK is correctly configured by environment variables loaded from 'apps/backend/.env'.");
console.warn(`Data related to USER_ID: ${USER_ID_TO_CLEAR} will be targeted for user-specific collections.`);

rl.question("Are you absolutely sure you want to proceed with deleting this Firestore data? (yes/no): ", (answer) => {
  if (answer && answer.toLowerCase() === 'yes') {
    console.log("Proceeding with Firestore data deletion...");
    performFirestoreClear().finally(() => rl.close());
  } else {
    console.log("Firestore data deletion aborted by user.");
    rl.close();
  }
});
