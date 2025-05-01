import type { NextRequest } from 'next/server';

// Dummy secret for JWT validation (replace with env var in production)
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Minimal JWT validation (replace with a real library like jose or jsonwebtoken in production)
export function verifyAuthToken(token: string): boolean {
  // TODO: Use a real JWT validation library
  if (!token) return false;
  // For demo: accept any non-empty token, but log if it's 'invalid'
  if (token === 'invalid') return false;
  return true;
}

// Log suspicious activity (could be extended to use a real logger or external service)
export function logSuspiciousActivity(request: NextRequest, reason: string) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const path = request.nextUrl.pathname;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  // In production, use a real logger or external monitoring
  console.warn(`[SECURITY] Suspicious activity: ${reason} | IP: ${ip} | Path: ${path} | UA: ${userAgent}`);
} 