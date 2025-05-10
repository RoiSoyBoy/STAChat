import { NextRequest, NextResponse } from 'next/server';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';
import { adminDb } from '@/lib/firebase-admin';
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Secure with Firebase Auth middleware
  const authResult = await firebaseAuthMiddleware(req);
  if (authResult) return authResult;
  const userId = getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

  try {
    const { question, answer, id } = await req.json();
    if (!question || typeof question !== 'string' || !answer || typeof answer !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid question/answer' }, { status: 400 });
    }
    // Classify tags on question + answer
    const tags = await classifyTagsWithOpenAI(`${question}\n${answer}`);
    const faqData = {
      question,
      answer,
      tags,
      updatedAt: Date.now(),
    };
    let faqId = id;
    if (faqId) {
      // Update existing FAQ
      await adminDb.collection('users').doc(userId).collection('faqs').doc(faqId).set(faqData, { merge: true });
    } else {
      // Add new FAQ
      faqId = uuidv4();
      await adminDb.collection('users').doc(userId).collection('faqs').doc(faqId).set({ ...faqData, createdAt: Date.now() });
    }
    return NextResponse.json({ id: faqId, ...faqData });
  } catch (error) {
    console.error('FAQ add/update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 