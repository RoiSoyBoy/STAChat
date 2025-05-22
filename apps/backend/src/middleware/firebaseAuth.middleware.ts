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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid auth token' });
  }
  const idToken = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }
  const userId = decoded.uid;
  if (!userId) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  // Attach userId to request (for downstream usage)
  req.userId = userId;
  next(); // Continue to the next middleware or route handler
}

// Helper for downstream usage in an Express context
export function getUserIdFromRequest(req: Request): string | null {
  return req.userId || null;
}
