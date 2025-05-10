import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';
import { extractMainContentFromHtml } from '@/lib/extractMainContentFromHtml';
import axios from 'axios';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/lib/classifyTagsWithOpenAI';
import { chunkText } from '@/lib/chunkText';
import { generateEmbeddings } from '@/lib/embedding';
import { extractQAFromTextWithLLM, QA } from '@/lib/preprocess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Canonical endpoint for web URL ingestion.
// Flow: Auth -> Deduplication -> Fetch & extract main content -> Chunking (chunkText) -> Tagging (classifyTagsWithOpenAI) -> Embedding (generateEmbeddings) -> Store in Pinecone & Firestore -> Logging.
// Handles multiple URLs, robust error handling, and user scoping.
//st RAG chat.

// Helper: Check if URL already processed for user
async function isUrlIndexed(userId: string, url: string): Promise<boolean> {
  const snapshot = await adminDb
    .collection('web_uploads')
    .where('userId', '==', userId)
    .where('url', '==', url)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export async function POST(req: NextRequest) {
  try {
    // Auth
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

    // Parse body
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) {
      return NextResponse.json({ error: 'Invalid URLs' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const index = pinecone.index(process.env.PINECONE_INDEX!).namespace(`user-${userId}`);

    const results: Array<{ url: string; status: string; chunkCount: number; error?: string }> = [];

    for (const url of urls) {
      let logEvent: any = {
        userId,
        url,
        startedAt: Date.now(),
        status: 'started',
      };
      try {
        // Deduplication
        if (await isUrlIndexed(userId, url)) {
          results.push({ url, status: 'skipped', chunkCount: 0 });
          logEvent.status = 'skipped';
          logEvent.reason = 'duplicate';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Fetch content
        let html: string;
        if (process.env.SCRAPINGBEE_API_KEY) {
          console.log('Using ScrapingBee for URL:', url);
          try {
            const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true`;
            const resp = await axios.get(apiUrl, { timeout: 20000 });
            html = resp.data;
          } catch (e) {
            results.push({ url, status: 'error', chunkCount: 0, error: 'unreachable' });
            logEvent.status = 'error';
            logEvent.error = 'unreachable';
            await adminDb.collection('web_uploads').add(logEvent);
            continue;
          }
        } else {
          console.log('Using direct fetch for URL:', url);
          try {
            const resp = await axios.get(url, { timeout: 15000 });
            html = resp.data;
          } catch (e) {
            results.push({ url, status: 'error', chunkCount: 0, error: 'unreachable' });
            logEvent.status = 'error';
            logEvent.error = 'unreachable';
            await adminDb.collection('web_uploads').add(logEvent);
            continue;
          }
        }
        // Extract main content
        const mainText = extractMainContentFromHtml(html);
        if (!mainText || mainText.length < 100) {
          results.push({ url, status: 'error', chunkCount: 0, error: 'no content' });
          logEvent.status = 'error';
          logEvent.error = 'no  zcontent';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Chunk text
        const chunks = chunkText(mainText);
        if (chunks.length === 0) {
          results.push({ url, status: 'error', chunkCount: 0, error: 'no chunks' });
          logEvent.status = 'error';
          logEvent.error = 'no chunks';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // --- Structured Q&A Extraction (ported from extract-url) ---
        // Extract Q&A pairs using regex and LLM
        let qas: QA[] = [];
        try {
          qas = await extractQAFromTextWithLLM(mainText);
        } catch (err) {
          console.error('Q&A extraction failed:', err);
          qas = [];
        }
        // Fallback: If LLM extraction returns nothing, use regex-based extraction
        if (!qas || qas.length === 0) {
          console.warn('LLM Q&A extraction returned no results, falling back to regex extraction.');
          const regexQAs = require('@/lib/preprocess').extractQAFromText(mainText);
          qas = regexQAs;
        }
        // For each Q&A, generate embedding and store in Firestore
        for (const qa of qas) {
          let embedding = null;
          try {
            const embeddingArr = await generateEmbeddings([qa.question]);
            embedding = embeddingArr[0];
          } catch (embedErr) {
            console.error('Embedding error for Q&A:', embedErr);
          }
          // Save to legacy/global training collection
          await adminDb.collection('training').add({
            question: qa.question,
            answer: qa.answer,
            sourceUrl: url,
            embedding,
            timestamp: Date.now(),
          });
          // Save to per-user trainingEmbeddings
          try {
            await adminDb
              .collection('trainingEmbeddings')
              .doc(userId)
              .collection('qas')
              .add({
                question: qa.question,
                answer: qa.answer,
                sourceUrl: url,
                embedding,
                timestamp: Date.now(),
              });
          } catch (firestoreEmbedErr) {
            console.error('Error saving embedding Q&A:', firestoreEmbedErr);
          }
        }
        // --- End Q&A Extraction ---
        // Tag classification (limit to 10 chunks)
        const maxChunksForTags = 10;
        const tagChunks = chunks.slice(0, maxChunksForTags);
        let tagsArr: string[][] = [];
        for (const chunk of tagChunks) {
          const tags = await classifyTagsWithOpenAI(chunk);
          tagsArr.push(tags);
        }
        while (tagsArr.length < chunks.length) {
          tagsArr.push(['general', 'uncategorized']);
        }
        // Embedding and Pinecone upsert
        let embeddings: number[][] = [];
        try {
          embeddings = await generateEmbeddings(chunks);
        } catch (e) {
          results.push({ url, status: 'error', chunkCount: 0, error: 'embedding error' });
          logEvent.status = 'error';
          logEvent.error = 'embedding error';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        const vectors = chunks.map((chunk: string, i: number) => ({
          id: `${userId}-${Date.now()}-${i}`,
          values: embeddings[i],
          metadata: {
            userId,
            url,
            chunkIndex: i,
            sourceType: 'web',
            text: chunk,
            tags: tagsArr[i],
          },
        }));
        try {
          await index.upsert(vectors);
        } catch (e) {
          results.push({ url, status: 'error', chunkCount: 0, error: 'pinecone error' });
          logEvent.status = 'error';
          logEvent.error = 'pinecone error';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Save metadata to Firestore for each chunk
        const batch = adminDb.batch();
        vectors.forEach((vec: any, i: number  ) => {
          const chunkRef = adminDb.collection('users').doc(userId).collection('urls').doc(vec.id);
          batch.set(chunkRef, {
            userId,
            url,
            chunkIndex: i,
            sourceType: 'web',
            text: chunks[i],
            tags: tagsArr[i],
            createdAt: Date.now(),
          });
        });
        await batch.commit();
        // Log success
        logEvent.status = 'success';
        logEvent.chunkCount = chunks.length;
        logEvent.completedAt = Date.now();
        await adminDb.collection('web_uploads').add(logEvent);
        results.push({ url, status: 'success', chunkCount: chunks.length });
      } catch (err: any) {
        results.push({ url, status: 'error', chunkCount: 0, error: 'internal error' });
        logEvent.status = 'error';
        logEvent.error = 'internal error';
        await adminDb.collection('web_uploads').add(logEvent);
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Fetch URL error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// TODO: Remove extract-url after confirming all clients use fetch-url and Q&A extraction is working as expected. 