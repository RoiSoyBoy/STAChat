import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// In-memory message storage
const messageStore: Record<string, Array<{
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}>> = {};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
      { status: 400 }
    );
  }

  const snapshot = await adminDb
    .collection('users')
    .doc(userId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .offset(offset)
    .limit(20)
    .get();

  const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const hasMore = messages.length === 20;

  return NextResponse.json({
    messages,
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, message, role = 'user' } = await request.json();

    if (!userId || !message) {
      return NextResponse.json(
        { error: 'User ID and message are required' },
        { status: 400 }
      );
    }

    const newMessage = {
      content: message,
      role,
      timestamp: Date.now(),
    };

    const docRef = await adminDb
      .collection('users')
      .doc(userId)
      .collection('messages')
      .add(newMessage);

    return NextResponse.json({ success: true, message: { id: docRef.id, ...newMessage } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 500 }
    );
  }
} 