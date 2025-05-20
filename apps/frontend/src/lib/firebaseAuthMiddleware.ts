import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebaseAdmin'; // Updated import

export async function firebaseAuthMiddleware(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid auth token' }, { status: 401 });
  }
  const idToken = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
  }
  const userId = decoded.uid;
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }
  // Attach userId to request (for downstream usage)
  (req as any).userId = userId;
  return null; // null means continue
}

// Helper for downstream usage
export function getUserIdFromRequest(req: NextRequest): string | null {
  return (req as any).userId || null;
}
