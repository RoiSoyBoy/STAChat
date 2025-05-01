import { NextRequest, NextResponse } from 'next/server';

// In-memory message storage
const messageStore: Record<string, Array<{
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
}>> = {};

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!clientId) {
    return NextResponse.json(
      { error: 'Client ID is required' },
      { status: 400 }
    );
  }

  const messages = messageStore[clientId] || [];
  const pageSize = 20;
  const paginatedMessages = messages.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < messages.length;

  return NextResponse.json({
    messages: paginatedMessages,
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { clientId, message } = await request.json();

    if (!clientId || !message) {
      return NextResponse.json(
        { error: 'Client ID and message are required' },
        { status: 400 }
      );
    }

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
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 500 }
    );
  }
} 