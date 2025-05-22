// import type { NextRequest } from 'next/server'; // Removed Next.js specific import
// For a generic backend, you might pass Express request or pre-extracted details.

// Dummy secret for JWT validation (replace with env var in production)
// Consider using a more secure way to handle secrets, e.g., a secrets manager.
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Minimal JWT validation.
// TODO: Implement proper JWT validation using the 'jsonwebtoken' library, which is already a backend dependency.
// Example with jsonwebtoken:
// import jwt from 'jsonwebtoken';
// export function verifyAuthToken(token: string): { valid: boolean; payload?: any; error?: string } {
//   if (!token) return { valid: false, error: 'No token provided' };
//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     return { valid: true, payload: decoded };
//   } catch (err: any) {
//     return { valid: false, error: err.message };
//   }
// }
export function verifyAuthToken(token: string): boolean {
  if (!token) return false;
  // For demo: accept any non-empty token, but log if it's 'invalid'
  if (token === 'invalid') {
    console.warn('[SECURITY] Received an explicitly "invalid" token for demo purposes.');
    return false;
  }
  // This is NOT secure for production.
  return true;
}

/**
 * Logs suspicious activity.
 * @param ip The IP address of the request.
 * @param path The path of the request.
 * @param userAgent The user agent of the request.
 * @param reason A string describing the reason for suspicion.
 */
export function logSuspiciousActivity(
  reason: string,
  details: {
    ip?: string | string[] | undefined;
    path?: string;
    userAgent?: string;
    userId?: string; // Optional: if user context is available
    additionalInfo?: Record<string, any>; // For any other relevant details
  } = {}
) {
  const ipString = Array.isArray(details.ip) ? details.ip.join(', ') : details.ip;
  // In production, use a structured logger (e.g., Winston, Pino) that outputs JSON
  // and integrates with a log management system (e.g., Datadog, Splunk, ELK stack).
  console.warn(
    `[SECURITY] Suspicious activity: ${reason} | IP: ${ipString || 'unknown'} | Path: ${details.path || 'unknown'} | UA: ${details.userAgent || 'unknown'}${details.userId ? ` | UserID: ${details.userId}` : ''}${details.additionalInfo ? ` | Extra: ${JSON.stringify(details.additionalInfo)}` : ''}`
  );
}
