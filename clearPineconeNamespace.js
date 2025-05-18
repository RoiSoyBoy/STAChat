// clearPineconeNamespace.js
const { Pinecone } = require('@pinecone-database/pinecone');
const readline = require('readline');

// --- Configuration ---
// Ensure these are your correct Pinecone API Key, Index Name, and the target Namespace.
const PINECONE_API_KEY = "pcsk_5KSV2e_KFT2B88yMrcVw9D9fScx5txbh6vem6YwPV44RQ3q5V5aZFoWdtM81mCWzbn6sx1"; // From your deletePineconeIndex.js
const PINEONE_INDEX_NAME = "chatbot-index"; // From your deletePineconeIndex.js
const NAMESPACE_TO_CLEAR = "user-test-user"; // IMPORTANT: Verify this is the correct namespace

async function performNamespaceClear() {
  if (!PINECONE_API_KEY || !PINECONE_API_KEY.startsWith("pcsk_")) {
    console.error("Error: Pinecone API Key is missing or invalid. Please verify.");
    return;
  }
  if (!PINEONE_INDEX_NAME) {
    console.error("Error: Pinecone Index Name is not specified.");
    return;
  }
  if (!NAMESPACE_TO_CLEAR) {
    console.error("Error: Namespace to clear is not specified.");
    return;
  }

  try {
    console.log("Initializing Pinecone client...");
    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

    console.log(`Checking if Pinecone index "${PINEONE_INDEX_NAME}" exists...`);
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes && existingIndexes.indexes.some(index => index.name === PINEONE_INDEX_NAME);

    if (!indexExists) {
      console.error(`Error: Pinecone index "${PINEONE_INDEX_NAME}" not found. Please check the index name or create the index.`);
      return;
    }
    console.log(`Pinecone index "${PINEONE_INDEX_NAME}" found.`);

    const index = pinecone.index(PINEONE_INDEX_NAME);
    const namespaceOperations = index.namespace(NAMESPACE_TO_CLEAR);

    console.log(`Attempting to delete all vectors from namespace "${NAMESPACE_TO_CLEAR}" in index "${PINEONE_INDEX_NAME}"...`);
    await namespaceOperations.deleteAll();
    console.log(`All vectors successfully deleted from namespace "${NAMESPACE_TO_CLEAR}".`);

  } catch (errorCaught) {
    console.error(`An error occurred while managing namespace "${NAMESPACE_TO_CLEAR}" in index "${PINEONE_INDEX_NAME}":`);
    if (errorCaught instanceof Error) {
      console.error("Error message: " + errorCaught.message);
      if (Object.prototype.hasOwnProperty.call(errorCaught, 'cause')) {
        const cause = errorCaught['cause'];
        console.error("Error Cause: " + cause);
      }
    } else {
      console.error("An unexpected non-Error value was thrown: " + errorCaught);
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.warn("\n!!! WARNING !!!");
console.warn(`This script is configured to permanently delete all vectors within the namespace "${NAMESPACE_TO_CLEAR}" in the Pinecone index named "${PINEONE_INDEX_NAME}".`);
console.warn("This action CANNOT be undone.");
console.warn("Please double-check that the API key, index name, and namespace are correct.");

rl.question(`Are you absolutely sure you want to delete all vectors in namespace "${NAMESPACE_TO_CLEAR}"? (yes/no): `, (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log("Proceeding with namespace vector deletion...");
    performNamespaceClear();
  } else {
    console.log("Namespace vector deletion aborted by user.");
  }
  rl.close();
});
