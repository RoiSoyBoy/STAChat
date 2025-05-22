// clearFirestoreData.js
require('dotenv').config({ path: 'apps/backend/.env' }); // Load apps/backend/.env
const { adminDb } = require('./apps/backend/src/lib/firebaseAdmin');
const readline = require('readline');

const USER_ID_TO_CLEAR = 'test-user';
// Helper function to delete all documents in a collection
async function deleteCollection(collectionPath, batchSize = 50) { // Reduced batchSize to 50
  const collectionRef = adminDb.collection(collectionPath);
  let query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject, 0);
  });
}

async function deleteQueryBatch(query, resolve, reject, docsDeleted) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      // When there are no documents left, we are done
      console.log(`Successfully deleted ${docsDeleted} documents from ${query._queryOptions.collectionId}.`);
      resolve(docsDeleted);
      return;
    }

    // Delete documents in a batch
    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    const numDeletedInBatch = snapshot.size;
    docsDeleted += numDeletedInBatch;
    process.stdout.write(`Deleted ${docsDeleted} documents so far...\r`);


    // Recurse on the next process tick, to avoid exploding the stack.
    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject, docsDeleted);
    });
  } catch (err) {
    console.error(`Error deleting batch from ${query._queryOptions.collectionId}:`, err);
    reject(err);
  }
}


async function performFirestoreClear() {
  try {
    console.log("Starting Firestore data deletion...");

    // 1. Delete all documents from 'web_uploads'
    console.log("\nDeleting all documents from 'web_uploads' collection...");
    await deleteCollection('web_uploads');

    // 2. Delete all documents from 'training'
    console.log("\nDeleting all documents from 'training' collection...");
    await deleteCollection('training');

    // 3. Delete documents from 'trainingEmbeddings/test-user/qas'
    const userTrainingQAsPath = `trainingEmbeddings/${USER_ID_TO_CLEAR}/qas`;
    console.log(`\nDeleting documents from '${userTrainingQAsPath}'...`);
    await deleteCollection(userTrainingQAsPath);
    // Also delete the user document itself in trainingEmbeddings if it's empty or if desired
    // For now, just clearing the subcollection. Consider deleting doc USER_ID_TO_CLEAR if its subcollections are its only content.


    // 4. Delete documents from 'users/test-user/urls'
    const userUrlsPath = `users/${USER_ID_TO_CLEAR}/urls`;
    console.log(`\nDeleting documents from '${userUrlsPath}'...`);
    await deleteCollection(userUrlsPath);
    // Also delete the user document itself in users if it's empty or if desired.
    // For now, just clearing the subcollection.

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
console.warn("This script is configured to permanently delete data from your Firestore database:");
console.warn("  - ALL documents from 'web_uploads' collection.");
console.warn("  - ALL documents from 'training' collection.");
console.warn(`  - All documents from 'trainingEmbeddings/${USER_ID_TO_CLEAR}/qas'.`);
console.warn(`  - All documents from 'users/${USER_ID_TO_CLEAR}/urls'.`);
console.warn("This action CANNOT be undone.");
console.warn("Please ensure your Firebase Admin SDK is correctly configured (e.g., GOOGLE_APPLICATION_CREDENTIALS environment variable).");

rl.question("Are you absolutely sure you want to proceed with deleting this Firestore data? (yes/no): ", (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log("Proceeding with Firestore data deletion...");
    performFirestoreClear();
  } else {
    console.log("Firestore data deletion aborted by user.");
  }
  rl.close();
});
