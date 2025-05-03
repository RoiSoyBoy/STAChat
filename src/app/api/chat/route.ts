import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/index';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper: check if the message is a basic greeting or intro
function isBasicGreeting(text: string) {
  const greetings = [
    'שלום', 'היי', 'מה נשמע', 'מה שלומך', 'הצג את עצמך', 'מי אתה', 'מי את', 'מי זה', 'מי זו', 'הצג מידע', 'הצג פרטים', 'הצג עזרה'
  ];
  return greetings.some(greet => text.trim().includes(greet));
}

// Helper: search for an answer in training data (Q&A pairs)
function findAnswerInTrainingData(message: string, trainingData: any[]): string | null {
  // Simple exact or case-insensitive match
  const found = trainingData.find(pair =>
    pair.question &&
    (pair.question.trim() === message.trim() ||
      pair.question.trim().toLowerCase() === message.trim().toLowerCase())
  );
  return found ? found.answer : null;
}

async function getTrainingDataAdmin() {
  const snapshot = await adminDb.collection('training').orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => doc.data());
}

async function getUploadsContext() {
  const snapshot = await adminDb.collection('uploads').orderBy('timestamp', 'desc').get();
  // For now, just join filenames and URLs as context
  return snapshot.docs.map(doc => doc.data()).map(d => `${d.filename}: ${d.url}`).join('\n');
}

async function getSettingsContext() {
  const doc = await adminDb.collection('settings').doc('main').get();
  const data = doc.exists ? doc.data() : null;
  let context = '';
  if (data && Array.isArray(data.urls) && data.urls.length > 0) {
    context += 'קישורים חשובים:\n' + data.urls.join('\n') + '\n';
  }
  if (data && typeof data.greeting === 'string' && data.greeting.trim()) {
    context += 'ברכת פתיחה: ' + data.greeting + '\n';
  }
  return context;
}

// Helper to get relevant URL content from Firestore
async function getRelevantUrlContent(clientId: string, message: string) {
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return '';
  const url = urlMatch[0];
  const snapshot = await adminDb
    .collection('trainingData')
    .doc(clientId)
    .collection('urls')
    .where('url', '==', url)
    .get();
  if (snapshot.empty) return '';
  return snapshot.docs[0].data().extractedText || '';
}

// Helper: normalize Hebrew business questions for fuzzy matching
function normalizeQuestion(q: string): string {
  // Remove common business prefixes, question forms, and extra spaces
  return q
    .replace(/שווארמה|פיצה|מסעדת|מסעדה|רשת|סניף|ה/i, '')
    .replace(/אפשר|האם|האם ניתן|האם אפשר|האם אפשרי|האם ניתן לרכוש|האם ניתן לקנות|איך|כיצד|מהם|מהן|מהו|מהי|מה|מדוע|למה|למי|מי|מתי|כמה|איפה|היכן|באילו|באיזה|באיזהו|באיזה מקום|באיזה תאריך|באיזה שעה|באיזה ימים|באיזה שעות|באיזה ימים ושעות|באיזה ימים ושעות פתוח/gi, '')
    .replace(/["'""''׳״.,:;!?\-]/g, '') // Remove punctuation
    .replace(/[^\u0590-\u05FF\w\s]/g, '') // Remove non-Hebrew/English/number chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Helper: retrieve relevant Q&A pairs from Firestore by fuzzy match
function wordOverlap(a: string, b: string): number {
  const aWords = Array.from(new Set(a.split(' ')));
  const bWords = new Set(b.split(' '));
  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }
  return overlap / Math.max(aWords.length, bWords.size);
}

async function getRelevantQAPairs(message: string, limit = 5) {
  const snapshot = await adminDb.collection('training').get();
  const allQAs = snapshot.docs.map(doc => doc.data() as { question: string; answer: string; sourceUrl?: string });
  const normMsg = normalizeQuestion(message);
  const scored: { question: string; answer: string; sourceUrl?: string; score: number }[] = allQAs
    .filter(qa => qa.question)
    .map(qa => {
      const normQ = normalizeQuestion(qa.question);
      const score = wordOverlap(normQ, normMsg);
      return { ...qa, score };
    })
    .filter(qa => qa.score > 0.07)
    .sort((a, b) => b.score - a.score);
  console.log('allQAs:', allQAs.map(qa => qa.question));
  console.log('normalized user:', normMsg);
  console.log('normalized qa:', allQAs.map(qa => normalizeQuestion(qa.question)));
  console.log('relevantQAs:', scored.slice(0, limit));
  return scored.slice(0, limit);
}

// Generate or retrieve a persistent clientId for this user/session
let clientId = typeof window !== "undefined" ? localStorage.getItem('clientId') : null;
if (typeof window !== "undefined" && !clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem('clientId', clientId);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple intent recognition for structured fields
function recognizeIntent(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('שעה') || lower.includes('פתיחה')) return 'hours';
  if (lower.includes('כתובת') || lower.includes('איפה')) return 'address';
  if (lower.includes('טלפון') || lower.includes('מספר')) return 'phone';
  if (lower.includes('תפריט') || lower.includes('מנות')) return 'menu';
  if (lower.includes('אתר') || lower.includes('website')) return 'website';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, clientId } = body;
    if (!message || !clientId) {
      return NextResponse.json(
        { error: 'Message and clientId are required' },
        { status: 400 }
      );
    }

    // 1. Structured data fallback (check most recent URL for client)
    const urlSnap = await adminDb
      .collection('trainingData')
      .doc(clientId)
      .collection('urls')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!urlSnap.empty) {
      const doc = urlSnap.docs[0].data();
      const intent = recognizeIntent(message);
      if (intent && doc.structured && doc.structured[intent]) {
        return NextResponse.json({ response: doc.structured[intent], isKnown: true, source: doc.url });
      }
    }

    // 2. Embedding-based semantic search
    let queryEmbedding: number[] | null = null;
    try {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: message,
      });
      queryEmbedding = embeddingRes.data[0].embedding;
    } catch (err: any) {
      console.error('Embedding error:', err);
      return NextResponse.json({ error: 'Embedding model unavailable or failed.' }, { status: 500 });
    }

    if (!queryEmbedding) {
      return NextResponse.json({ error: 'Embedding model unavailable.' }, { status: 500 });
    }

    // 3. Retrieve all Q&A embeddings for this client
    let qas: { question: string; answer: string; sourceUrl?: string; embedding: number[] }[] = [];
    try {
      const snapshot = await adminDb.collection('trainingEmbeddings').doc(clientId).collection('qas').get();
      qas = snapshot.docs.map(doc => doc.data() as { question: string; answer: string; sourceUrl?: string; embedding: number[] });
    } catch (err) {
      console.error('Firestore Q&A embedding fetch error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // 4. Compute cosine similarity and select top 3 above threshold
    const threshold = 0.7;
    const scored = qas
      .filter(qa => Array.isArray(qa.embedding) && qa.embedding.length === queryEmbedding.length)
      .map(qa => ({ ...qa, score: cosineSimilarity(queryEmbedding!, qa.embedding) }))
      .filter(qa => qa.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length > 0) {
      // Return the top answer(s)
      return NextResponse.json({
        response: scored[0].answer,
        isKnown: true,
        source: scored[0].sourceUrl || null,
        alternatives: scored.slice(1).map(qa => ({ answer: qa.answer, source: qa.sourceUrl || null, score: qa.score })),
        score: scored[0].score
      });
    }

    // 5. Fallback
    return NextResponse.json({ response: 'אין לי תשובה לשאלה זו על פי המידע שסיפקת.', isKnown: false });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}; 