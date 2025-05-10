import { NextRequest, NextResponse } from 'next/server';
<<<<<<< HEAD
import { adminDb } from '@/lib/firebase-admin';
=======
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02

// In-memory message storage
const messageStore: Record<string, Array<{
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}>> = {};

export const dynamic = 'force-dynamic';
<<<<<<< HEAD
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
=======
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!clientId) {
    return NextResponse.json(
      { error: 'Client ID is required' },
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
      { status: 400 }
    );
  }

<<<<<<< HEAD
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
=======
  const messages = messageStore[clientId] || [];
  const pageSize = 20;
  const paginatedMessages = messages.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < messages.length;

  return NextResponse.json({
    messages: paginatedMessages,
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  try {
<<<<<<< HEAD
    const { userId, message, role = 'user' } = await request.json();

    if (!userId || !message) {
      return NextResponse.json(
        { error: 'User ID and message are required' },
=======
    const { clientId, message } = await request.json();

    if (!clientId || !message) {
      return NextResponse.json(
        { error: 'Client ID and message are required' },
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
        { status: 400 }
      );
    }

<<<<<<< HEAD
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
=======
    if (!messageStore[clientId]) {
      messageStore[clientId] = [];
    }

    const newMessage = {
      id: Date.now().toString(),
      content: message,
      role: 'user' as const,
      timestamp: Date.now(),
    };

    messageStore[clientId].push(newMessage);

    return NextResponse.json({ success: true, message: newMessage });
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 500 }
    );
  }
} 