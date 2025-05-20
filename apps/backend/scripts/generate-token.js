// generate-token.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from ../.env (relative to this script)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('Error: JWT_SECRET is not defined in your .env file in apps/backend/.env');
  console.error('Please ensure the .env file exists and JWT_SECRET is set.');
  process.exit(1);
}

// Sample payload for the token. Modify as needed.
// The 'id' and 'tenantId' are particularly important for the backend logic.
const payload = {
  id: 'test-user-123', // Example user ID
  email: 'testuser@example.com',
  tenantId: 'tenant-abc-789', // Example tenant ID
  // Add any other claims you expect in your token
  // name: 'Test User' 
};

// Token expiration (e.g., 1 hour, 7 days)
const expiresIn = '1h'; // You can use strings like '1d', '7d', '30m'

try {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn });
  console.log('Generated JWT:');
  console.log(token);
  console.log('\nPayload used:');
  console.log(JSON.stringify(payload, null, 2));
  console.log(`\nThis token will expire in: ${expiresIn}`);
} catch (error) {
  console.error('Error generating JWT:', error.message);
  if (error.message.includes('secretOrPrivateKey must have a value')) {
    console.error('This likely means JWT_SECRET was empty or undefined when signing.');
  }
  process.exit(1);
}
