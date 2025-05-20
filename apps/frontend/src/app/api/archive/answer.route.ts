// TODO: This endpoint overlaps with chat and should be consolidated or removed after migration. See chat for canonical RAG logic.
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { generateContextFromPinecone } from '@/lib/generateContextFromPinecone';
import { OpenAI } from 'openai';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Secure with Firebase Auth middleware
    const authResult = await firebaseAuthMiddleware(req);
    if (authResult) return authResult;
    const userId = getUserIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    // Parse body
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid question' }, { status: 400 });
    }

    // Retrieve context from Pinecone
    const { context, sources } = await generateContextFromPinecone({
      userId,
      question,
      pineconeApiKey: process.env.PINECONE_API_KEY!,
      pineconeIndex: process.env.PINECONE_INDEX!,
      openaiApiKey: process.env.OPENAI_API_KEY!,
      similarityThreshold: 0.75,
      topK: 5,
    });

    // If no context, fallback
    if (!context) {
      const fallback = 'מצטער, אין לי מספיק מידע לענות על השאלה הזו.';
      await adminDb.collection('users').doc(userId).collection('answers').add({
        userId,
        question,
        context,
        answer: fallback,
        sources,
        createdAt: Date.now(),
      });
      return NextResponse.json({ answer: fallback, sources });
    }

    // System prompt for GPT-4
    const systemPrompt = `ענה על השאלה בעברית בלבד. השתמש אך ורק במידע המופיע בהקשר. אם אין מספיק מידע, אמור שאינך יודע.\n\nהקשר:\n${context}`;

    // Call GPT-4
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    let gptAnswer = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-nano-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });
      gptAnswer = completion.choices[0].message.content?.trim() || '';
    } catch (e) {
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 502 });
    }

    // Log to Firestore
    await adminDb.collection('users').doc(userId).collection('answers').add({
      userId,
      question,
      context,
      answer: gptAnswer,
      sources,
      createdAt: Date.now(),
    });

    return NextResponse.json({ answer: gptAnswer, sources });
  } catch (error) {
    console.error('Answer route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 