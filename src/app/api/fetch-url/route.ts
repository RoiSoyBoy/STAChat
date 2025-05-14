import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';
// import { extractMainContentFromHtml } from '@/lib/extractMainContentFromHtml'; // Replaced by Firecrawl
// import axios from 'axios'; // Replaced by Firecrawl fetch
import { fetchFirecrawlData } from '@/lib/firecrawl'; // Import Firecrawl fetch function
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
//
// See also: /upload/pdf for PDF ingestion, /chat for RAG chat.

// Helper: Check if URL already processed for user
async function isUrlIndexed(userId: string, url: string): Promise<boolean> {
  console.log(`[Auth] Checking if URL is indexed for userId: ${userId}, url: ${url}`);
  const snapshot = await adminDb
    .collection('web_uploads')
    .where('userId', '==', userId)
    .where('url', '==', url)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export async function POST(req: NextRequest) {
  console.log(`[API /api/fetch-url] Received POST request. Headers:`, JSON.stringify(Object.fromEntries(req.headers.entries())));
  try {
    const authHeader = req.headers.get('authorization');
    let userId = 'test-user'; // Default for local testing

    // --- Authentication ---
    // if (process.env.NODE_ENV !== 'development' || (authHeader && authHeader.startsWith('Bearer '))) {
    //   if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //     console.error('[Auth] Missing or invalid auth token.');
    //     return NextResponse.json({ error: 'Missing or invalid auth token' }, { status: 401 });
    //   }
    //   const idToken = authHeader.split(' ')[1];
    //   try {
    //     console.log('[Auth] Verifying ID token...');
    //     const decoded = await getAuth().verifyIdToken(idToken);
    //     userId = decoded.uid;
    //     console.log(`[Auth] Token verified. UserId: ${userId}`);
    //     if (!userId) {
    //       console.error('[Auth] UserID not found in decoded token.');
    //       return NextResponse.json({ error: 'User not found after token verification' }, { status: 401 });
    //     }
    //   } catch (e: any) {
    //     console.error('[Auth] Invalid or expired auth token:', e.message);
    //     return NextResponse.json({ error: 'Invalid or expired auth token', details: e.message }, { status: 401 });
    //   }
    // } else {
    //   console.log('[Auth] Skipping auth for local development, using test-user.');
    // }
    console.log(`[Auth] Using effective UserId: ${userId}`);


    // Parse body
    let urls;
    try {
      const body = await req.json();
      urls = body.urls;
      console.log('[API /api/fetch-url] Parsed request body:', body);
    } catch (e: any) {
      console.error('[API /api/fetch-url] Error parsing JSON body:', e.message);
      return NextResponse.json({ error: 'Invalid JSON body', details: e.message }, { status: 400 });
    }

    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) {
      console.error('[API /api/fetch-url] Invalid URLs in request:', urls);
      return NextResponse.json({ error: 'Invalid URLs format' }, { status: 400 });
    }

    // --- Environment Variable Checks ---
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY; // Check here as well

    if (!openaiApiKey) {
      console.error('ERROR: OPENAI_API_KEY environment variable is not defined in /api/fetch-url.');
      throw new Error('CRITICAL: OPENAI_API_KEY is missing for /api/fetch-url.');
    } else {
      console.log('[API /api/fetch-url] OpenAI API Key loaded.');
    }
    if (!pineconeApiKey) {
      console.error('ERROR: PINECONE_API_KEY environment variable is not defined in /api/fetch-url.');
      throw new Error('CRITICAL: PINECONE_API_KEY is missing for /api/fetch-url.');
    } else {
      console.log('[API /api/fetch-url] Pinecone API Key loaded.');
    }
    if (!pineconeIndexName) {
      console.error('ERROR: PINECONE_INDEX environment variable is not defined in /api/fetch-url.');
      throw new Error('CRITICAL: PINECONE_INDEX is missing for /api/fetch-url.');
    } else {
      console.log('[API /api/fetch-url] Pinecone Index Name loaded.');
    }
    if (!firecrawlApiKey) {
      // This check is also in `fetchFirecrawlData`, but good for early exit.
      console.error('ERROR: FIRECRAWL_API_KEY environment variable is not defined (checked in /api/fetch-url).');
      throw new Error('CRITICAL: FIRECRAWL_API_KEY is missing for /api/fetch-url.');
    } else {
      console.log('[API /api/fetch-url] Firecrawl API Key loaded (checked in /api/fetch-url).');
    }


    const openai = new OpenAI({ apiKey: openaiApiKey });
    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const index = pinecone.index(pineconeIndexName).namespace(`user-${userId}`);

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
        // Fetch content using Firecrawl
        let firecrawlResult;
        try {
          console.log(`[API /api/fetch-url] Attempting to fetch Firecrawl data for URL: ${url}`);
          // Use the fetchFirecrawlData function from src/lib/firecrawl.ts
          firecrawlResult = await fetchFirecrawlData(url);
          console.log(`[API /api/fetch-url] Firecrawl result for ${url}:`, JSON.stringify(firecrawlResult, null, 2).substring(0, 500) + '...'); // Log snippet
        } catch (e: any) {
          console.error(`[API /api/fetch-url] Firecrawl fetch call failed for ${url}:`, e.message);
          // The detailed error (including 401) should be logged by fetchFirecrawlData itself.
          results.push({ url, status: 'error', chunkCount: 0, error: `firecrawl fetch failed: ${e.message}` });
          logEvent.status = 'error';
          logEvent.error = `firecrawl fetch failed: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        // Extract main content from Firecrawl result (Cloud API returns content as a string)
        const mainText = typeof firecrawlResult?.content === 'string' ? firecrawlResult.content : '';

        if (!mainText || mainText.length < 100) {
          // Add the actual result to the log for debugging lack of content
          console.log(`[DEBUG] Insufficient content from Firecrawl for ${url}:`, JSON.stringify(firecrawlResult, null, 2));
          results.push({ url, status: 'error', chunkCount: 0, error: 'no content from firecrawl' });
          logEvent.status = 'error';
          logEvent.error = 'no content from firecrawl';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Chunk text (This block was duplicated, removing the second instance)
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
        } catch (e: any) { // Added : any type for error object
          // Log the specific Pinecone error
          console.error(`Pinecone upsert failed for ${url}:`, e);
          results.push({ url, status: 'error', chunkCount: 0, error: `pinecone error: ${e.message || e}` });
          logEvent.status = 'error';
          logEvent.error = `pinecone error: ${e.message || e}`; // Log specific error message
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
      } catch (err: any) {
        // Log the specific error to the server console for debugging
        console.error(`Processing failed for ${url}:`, err);
        results.push({ url, status: 'error', chunkCount: 0, error: 'internal error' });
        logEvent.status = 'error';
        // Add more specific error info to the Firestore log
        logEvent.error = `internal error: ${err.message || err}`;
        await adminDb.collection('web_uploads').add(logEvent);
      }
    } // End of for loop

    // Removed the extra closing brace here

    return NextResponse.json({ results });
  } catch (error: any) { // This catch now correctly belongs to the main try block
    console.error('[API /api/fetch-url] Top-level error in POST handler:', error.message, error.stack);
    // Ensure a response is always sent
    if (error.message.includes('CRITICAL:')) { // For API key errors we threw
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error in /api/fetch-url', details: error.message }, { status: 500 });
  }
}

// TODO: Remove extract-url after confirming all clients use fetch-url and Q&A extraction is working as expected.
