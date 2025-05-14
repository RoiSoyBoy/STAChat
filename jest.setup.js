// Import Jest DOM matchers like .toBeInTheDocument()
import '@testing-library/jest-dom';

// Set dummy environment variables for tests
process.env.OPENAI_API_KEY = 'test-key';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
// Use a placeholder PEM-like key
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC3\n-----END PRIVATE KEY-----';

// Mock scrollIntoView for JSDOM
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.scrollTo = jest.fn();
}

// Add any other global setup needed for your tests below
