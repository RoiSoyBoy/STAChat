import { NextRequest, NextResponse } from 'next/server';
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';
import { adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Secure with Firebase Auth middleware
  const authResult = await firebaseAuthMiddleware(req);
  if (authResult) return authResult;
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  try {
    const { text, chunkId, documentId, type } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid text' }, { status: 400 });
    }
    // Limit text length for token usage
    const tags = await classifyTagsWithOpenAI(text.slice(0, 2000));

    // Optionally update Firestore
    if (chunkId && type) {
      let collectionName = '';
      if (type === 'upload') collectionName = 'uploads';
      else if (type === 'url') collectionName = 'urls';
      else if (type === 'faq') collectionName = 'faqs';
      if (collectionName) {
        await adminDb.collection('users').doc(userId).collection(collectionName).doc(chunkId).set({ tags }, { merge: true });
      }
    }
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Classify tags error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
