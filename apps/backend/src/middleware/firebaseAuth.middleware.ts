import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@/lib/firebaseAdmin'; 

// Extend Express Request interface to include userId (optional, for better type safety)
// This is a common practice. Alternatively, use (req as any).userId.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function firebaseAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  console.log(`[firebaseAuthMiddleware] Checking auth. NODE_ENV: ${process.env.NODE_ENV}, BYPASS_FIREBASE_AUTH: ${process.env.BYPASS_FIREBASE_AUTH}`);

  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_FIREBASE_AUTH === 'true') {
    const devUserId = process.env.DEV_USER_ID || 'default-dev-user';
    console.log(`[firebaseAuthMiddleware] DEV MODE: Bypassing Firebase token validation. Using userId: ${devUserId}`);
    req.userId = devUserId; // Attach mock userId
    // Ensure req.user is also populated if other parts of the app expect it (e.g. TenantAwareRequest)
    // @ts-ignore
    if (!req.user) req.user = {};
    // @ts-ignore
    req.user.id = devUserId; 
    // @ts-ignore
    req.user.uid = devUserId; // Common alternative property name

    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid auth token' });
  }
  const idToken = authHeader.split(' ')[1];
  let decodedToken; // Renamed for clarity
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }

  if (!decodedToken || !decodedToken.uid) { // Check decodedToken itself and uid
    return res.status(401).json({ error: 'User not found in token' });
  }
  
  const userId = decodedToken.uid;
  // Attach userId to request (for downstream usage)
  req.userId = userId; // For direct use via req.userId
  
  // Also populate req.user for compatibility with TenantAwareRequest if it expects req.user.id
  // @ts-ignore
  if (!req.user) req.user = {};
  // @ts-ignore
  req.user.id = userId;
  // @ts-ignore
  req.user.uid = userId; // Populate uid as well, as it's common
  // @ts-ignore
  req.user.email = decodedToken.email; // Optionally populate email if available and needed

  next(); // Continue to the next middleware or route handler
}

// Helper for downstream usage in an Express context
export function getUserIdFromRequest(req: Request): string | null {
  return req.userId || null;
}
