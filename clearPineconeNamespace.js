// clearPineconeNamespace.js
const { Pinecone } = require('@pinecone-database/pinecone');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Attempt to load .env.local if it exists, otherwise default to .env
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
  console.log("Loaded environment variables from .env.local");
} else {
  require('dotenv').config(); // Default to .env
  console.log("Loaded environment variables from .env (or environment)");
}

// --- Configuration ---
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX; // Assuming your .env uses PINECONE_INDEX

async function performNamespaceClear(userIdToClear) {
  if (!userIdToClear) {
    console.error("Error: No userId provided to clear. Usage: node clearPineconeNamespace.js <userId>");
    return;
  }
  const namespaceToClear = `user-${userIdToClear}`;

  if (!PINECONE_API_KEY || !PINECONE_API_KEY.startsWith("pcsk_")) { // A basic check for Pinecone API key format
    console.error("Error: Pinecone API Key is missing or invalid. Please check your .env file or environment variables.");
    return;
  }
  if (!PINECONE_INDEX_NAME) {
    console.error("Error: Pinecone Index Name is not specified. Please check your .env file or environment variables (PINECONE_INDEX).");
    return;
  }

  try {
    console.log("Initializing Pinecone client...");
    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });

    console.log(`Checking if Pinecone index "${PINECONE_INDEX_NAME}" exists...`);
    const existingIndexes = await pinecone.listIndexes();
    // Ensure existingIndexes.indexes is not null or undefined before trying to access its properties
    const indexDetails = existingIndexes.indexes && existingIndexes.indexes.find(index => index.name === PINECONE_INDEX_NAME);

    if (!indexDetails) {
      console.error(`Error: Pinecone index "${PINECONE_INDEX_NAME}" not found. Please check the index name or create the index.`);
      return;
    }
    console.log(`Pinecone index "${PINECONE_INDEX_NAME}" found.`);

    const index = pinecone.index(PINECONE_INDEX_NAME);
    const namespaceOperations = index.namespace(namespaceToClear);

    console.log(`Attempting to delete all vectors from namespace "${namespaceToClear}" in index "${PINECONE_INDEX_NAME}"...`);
    await namespaceOperations.deleteAll();
    console.log(`All vectors successfully deleted from namespace "${namespaceToClear}".`);

  } catch (errorCaught) {
    console.error(`An error occurred while managing namespace "${namespaceToClear}" in index "${PINECONE_INDEX_NAME}":`);
    // Check if the error is a Pinecone API error and if it's a 404
    // Pinecone client errors often have a 'status' or similar property, or the message might contain "HTTP status 404"
    // This is a heuristic check based on the observed error message.
    // A more robust check might involve inspecting error.name or error.code if the Pinecone client provides them.
    if (errorCaught instanceof Error && errorCaught.message && errorCaught.message.includes("HTTP status 404")) {
      console.log(`Namespace "${namespaceToClear}" was not found or was already empty (received 404). Considered clear.`);
    } else if (errorCaught instanceof Error) {
      console.error("Error message: " + errorCaught.message);
      if (Object.prototype.hasOwnProperty.call(errorCaught, 'cause')) {
        const cause = errorCaught['cause'];
        console.error("Error Cause: " + String(cause)); // Ensure cause is stringified
      }
    } else {
      console.error("An unexpected non-Error value was thrown: " + String(errorCaught)); // Ensure thrown value is stringified
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const userIdArg = process.argv[2]; // Get the userId from the command line argument

if (!userIdArg) {
  console.error("Usage: node clearPineconeNamespace.js <userId>");
  console.error("Example: node clearPineconeNamespace.js test-user");
  rl.close();
} else {
  const fullNamespaceToClear = `user-${userIdArg}`;
  console.warn("\n!!! WARNING !!!");
  console.warn(`This script is configured to permanently delete all vectors within the namespace "${fullNamespaceToClear}" in the Pinecone index named "${PINECONE_INDEX_NAME}".`);
  console.warn("This action CANNOT be undone.");
  console.warn("Please ensure PINECONE_API_KEY and PINECONE_INDEX are correctly set in your .env file or environment.");

  rl.question(`Are you absolutely sure you want to delete all vectors in namespace "${fullNamespaceToClear}"? (yes/no): `, (answer) => {
    if (answer.toLowerCase() === 'yes') {
      console.log("Proceeding with namespace vector deletion...");
      performNamespaceClear(userIdArg);
    } else {
      console.log("Namespace vector deletion aborted by user.");
    }
    rl.close();
  });
}
