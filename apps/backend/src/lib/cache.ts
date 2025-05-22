import NodeCache from 'node-cache';
// import { NextResponse } from 'next/server'; // Removed Next.js specific import

// Cache instance with 5 minute TTL by default
export const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 320,
});

// Cache keys
export const CACHE_KEYS = {
  CLIENT_CONTEXT: (clientId: string) => `client_context_${clientId}`,
  MESSAGES: (clientId: string) => `messages_${clientId}`,
};

// Rate limiting for API routes
const rateLimits = new Map<string, { count: number; timestamp: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // Example: 100 requests per minute

  const current = rateLimits.get(ip) || { count: 0, timestamp: now };
  
  // Reset if window has passed
  if (now - current.timestamp > windowMs) {
    current.count = 1;
    current.timestamp = now;
    rateLimits.set(ip, current);
    return true;
  }

  // Increment and check
  current.count++;
  rateLimits.set(ip, current);
  
  return current.count <= maxRequests;
}

// TODO: Adapt this function for the specific backend framework (e.g., Express)
// For example, in Express, it might look like:
// export function getRateLimitResponse(res: express.Response) {
//   return res.status(429).json({ error: 'נא לנסות שוב בעוד דקה' });
// }
/*
export function getRateLimitResponse() {
  return NextResponse.json(
    { error: 'נא לנסות שוב בעוד דקה' },
    { status: 429 }
  );
}
*/

// Cache middleware for client context
export const withCache = async <T>(
  key: string,
  getData: () => Promise<T>,
  ttl = 300 // 5 minutes default
): Promise<T> => {
  const cachedData = cache.get<T>(key);
  if (cachedData) {
    console.log(`[Cache] HIT for key: ${key}`);
    return cachedData;
  }
  console.log(`[Cache] MISS for key: ${key}`);
  const data = await getData();
  cache.set(key, data, ttl);
  return data;
};
