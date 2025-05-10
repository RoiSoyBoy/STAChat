import { NextRequest, NextResponse } from 'next/server';
import { userCollection } from '@/lib/firebase';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';
import { adminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import OpenAI from 'openai';
import NodeCache from 'node-cache';
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { buildPrompt, ChatTurn } from '@/lib/buildPrompt';
import { Pinecone } from '@pinecone-database/pinecone';
import { generateContextFromPinecone } from '@/lib/generateContextFromPinecone';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const cache = new NodeCache({ stdTTL: 60 * 10 }); // 10 min cache

// In-memory conversation store (per user)
const memoryStore: Record<string, BufferMemory> = {};

// Canonical endpoint for RAG-enabled chat.
// Flow: Auth -> Parse message -> FAQ fallback -> Retrieve context from Pinecone (generateContextFromPinecone) -> Build prompt (buildPrompt) -> Call GPT-4 -> Postprocess for citations -> Log turn in Firestore -> Return answer with sources.
// Handles multi-turn memory, user scoping, and advanced prompt customization.
//
// See also: /fetch-url and /upload/pdf for ingestion, /answer (legacy).

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
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data());
}

async function getUploadsContext() {
  const snapshot = await adminDb.collection('uploads').orderBy('timestamp', 'desc').get();
  // For now, just join filenames and URLs as context
  return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data()).map((d: any) => `${d.filename}: ${d.url}`).join('\n');
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
  // Secure with Firebase Auth middleware
  // const authResult = await firebaseAuthMiddleware(request);
  // if (authResult) return authResult;
  // const userId = getUserIdFromRequest(request);
  // if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });
  const userId = 'test-user'; // Hardcoded for local testing

  try {
    // Parse body
    const { message } = await request.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Respond to greetings
    if (isBasicGreeting(message)) {
      return NextResponse.json({ response: 'שלום! איך אפשר לעזור?', source: 'greeting' });
    }

    // NodeCache: check for repeated question
    const cacheKey = `${userId}:${message.trim()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ response: cached, cached: true });
    }

    // Conversation memory (last 4 turns)
    if (!memoryStore[userId]) {
      memoryStore[userId] = new BufferMemory({
        chatHistory: new ChatMessageHistory(),
        memoryKey: 'history',
        inputKey: 'message',
        outputKey: 'response',
        returnMessages: true,
      });
    }
    const memory = memoryStore[userId];
    // Convert BaseMessage[] to ChatTurn[]
    const baseHistory = (await memory.chatHistory.getMessages()).slice(-4);
    const history: ChatTurn[] = baseHistory.map(msg => {
      const dict = msg.toDict();
      return {
        role: dict.type === 'ai' ? 'assistant' : 'user',
        content: typeof dict.data.content === 'string' ? dict.data.content : '',
      };
    });

    // 1. FAQ matching (exact)
    const faqSnap = await adminDb.collection('training').get();
    const faqs = faqSnap.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => doc.data() as { question: string; answer: string });
    const faqMatch = faqs.find((faq: { question: string; answer: string }) => faq.question.trim() === message.trim());
    if (faqMatch) {
      // Log turn
      await adminDb.collection('users').doc(userId).collection('chat_turns').add({
        userId,
        message,
        response: faqMatch.answer,
        context: 'FAQ',
        timestamp: Date.now(),
      });
      memory.chatHistory.addMessage(new HumanMessage(message));
      memory.chatHistory.addMessage(new AIMessage(faqMatch.answer));
      cache.set(cacheKey, faqMatch.answer);
      return NextResponse.json({ response: faqMatch.answer, source: 'faq' });
    }

    // 2. RAG: retrieve context from Pinecone
    let context = '';
    let sources: any[] = [];
    let citationMap: any = {};
    let botSettings: any = {};
    try {
      const ctxResult = await generateContextFromPinecone({
        userId,
        question: message,
        pineconeApiKey: process.env.PINECONE_API_KEY!,
        pineconeIndex: process.env.PINECONE_INDEX!,
        openaiApiKey: process.env.OPENAI_API_KEY!,
        similarityThreshold: 0.75,
        topK: 5,
      });
      context = ctxResult.context;
      sources = ctxResult.sources;
      citationMap = ctxResult.citationMap;
      // Fetch bot settings
      const settingsDoc = await adminDb.collection('settings').doc('main').get();
      botSettings = settingsDoc.exists ? settingsDoc.data() : {};
    } catch (e) {
      context = '';
      sources = [];
      citationMap = {};
      botSettings = {};
    }

    // 3. Build system prompt with bot settings
    let toneInstruction = '';
    if (botSettings.tone === 'casual') {
      toneInstruction = 'דבר בטון קליל, ידידותי ומשעשע.';
    } else if (botSettings.tone === 'humorous') {
      toneInstruction = 'דבר בטון מצחיק, הוסף הומור עדין.';
    } else if (botSettings.tone === 'formal') {
      toneInstruction = 'דבר בטון רשמי ומכובד.';
    } else {
      toneInstruction = 'שמור על טון ידידותי ורשמי.';
    }
    const botName = botSettings.botName || 'הבוט';
    const botDesc = botSettings.description ? ` (${botSettings.description})` : '';
    const introMsg = botSettings.introMessage || '';
    const system = `${botName}${botDesc ? ' - ' + botDesc : ''}\n${toneInstruction}\n${introMsg}\nענה על השאלה בעברית בלבד. השתמש רק במידע מההקשר. אם אין מספיק מידע, אמור שאינך יודע.`;
    const promptMessages = buildPrompt({
      system,
      history,
      context,
      userMessage: message,
    }) as any;

    // 4. Call GPT-4
    let gptAnswer = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'chatgpt-4o-latest'
        ,
        messages: promptMessages as any,
        max_tokens: 500,
        temperature: 0.5,
      });
      gptAnswer = completion.choices[0].message.content?.trim() || '';
    } catch (e) {
      gptAnswer = '';
    }

    // 5. Fallback if GPT fails
    if (!gptAnswer) {
      gptAnswer = 'מצטער, אין לי מספיק מידע לענות על השאלה הזו.';
    }

    // 5.5. Postprocess for citations
    const citationRegex = /\[(\d+)\]/g;
    const foundCitations = new Set<number>();
    let match;
    while ((match = citationRegex.exec(gptAnswer)) !== null) {
      foundCitations.add(Number(match[1]));
    }
    // Build sources footer
    let sourcesFooter = '';
    if (foundCitations.size > 0 && Object.keys(citationMap).length > 0) {
      const sourceList = Array.from(foundCitations)
        .map(n => {
          const src = citationMap[n];
          if (!src) return null;
          if (src.sourceType === 'pdf') return `[${n}] ${src.fileName}`;
          if (src.sourceType === 'web') return `[${n}] ${src.url}`;
          if (src.sourceType === 'faq') return `[${n}] ${src.fileName || src.url}`;
          return `[${n}] ${src.fileName || src.url || 'Unknown'}`;
        })
        .filter(Boolean)
        .join(', ');
      sourcesFooter = `\n\nמקורות: ${sourceList}`;
    } else {
      sourcesFooter = '\n\nמקור לא ידוע';
    }
    const finalAnswer = gptAnswer + sourcesFooter;

    // 6. Log turn
    await adminDb.collection('users').doc(userId).collection('chat_turns').add({
      userId,
      message,
      response: finalAnswer,
      context,
      sources,
      timestamp: Date.now(),
    });
    memory.chatHistory.addMessage(new HumanMessage(message));
    memory.chatHistory.addMessage(new AIMessage(finalAnswer));
    cache.set(cacheKey, finalAnswer);

    return NextResponse.json({ response: finalAnswer, source: context ? 'rag' : 'gpt', sources, citationMap });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}; 