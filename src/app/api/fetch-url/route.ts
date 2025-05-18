import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '@/lib/firebase-admin';
import { extractMainContentFromHtml } from '@/lib/extractMainContentFromHtml'; // Import our custom HTML extractor
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
          console.log(`[API /api/fetch-url] Firecrawl result object for ${url} (metadata & snippet):`, JSON.stringify({ ...firecrawlResult, content: firecrawlResult.content ? firecrawlResult.content.substring(0, 500) + '...' : null, markdown: firecrawlResult.markdown ? firecrawlResult.markdown.substring(0,500) + '...' : null }, null, 2));
          // Log a preview of the content separately as requested for debugging
          console.log(`[API /api/fetch-url] BEGIN PREVIEW Firecrawl content for ${url} (first 1000 chars):`);
          if (firecrawlResult.content) {
            console.log(firecrawlResult.content.slice(0, 1000));
          } else {
            console.log("firecrawlResult.content is null or undefined");
          }
          console.log(`[API /api/fetch-url] END PREVIEW Firecrawl content for ${url}`);
        } catch (e: any) {
          console.error(`[API /api/fetch-url] Firecrawl fetch call failed for ${url}:`, e.message);
          // The detailed error (including 401) should be logged by fetchFirecrawlData itself.
          results.push({ url, status: 'error', chunkCount: 0, error: `firecrawl fetch failed: ${e.message}` });
          logEvent.status = 'error';
          logEvent.error = `firecrawl fetch failed: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        // Extract main content
        let mainText = '';
        if (firecrawlResult?.html) {
          console.log(`[API /api/fetch-url] Extracting content from HTML for ${url} using custom extractor.`);
          mainText = extractMainContentFromHtml(firecrawlResult.html);
          // Log preview of custom extracted text
          console.log(`[API /api/fetch-url] BEGIN PREVIEW Custom Extracted content for ${url} (first 1000 chars):`);
          console.log(mainText.slice(0, 1000));
          console.log(`[API /api/fetch-url] END PREVIEW Custom Extracted content for ${url}`);
        } else if (firecrawlResult?.content) {
          console.log(`[API /api/fetch-url] Using Firecrawl's 'content' field for ${url} as HTML was not available.`);
          mainText = firecrawlResult.content;
           // Log preview of Firecrawl's direct content
          console.log(`[API /api/fetch-url] BEGIN PREVIEW Firecrawl direct content for ${url} (first 1000 chars):`);
          console.log(mainText.slice(0, 1000));
          console.log(`[API /api/fetch-url] END PREVIEW Firecrawl direct content for ${url}`);
        } else {
          console.log(`[API /api/fetch-url] No HTML or content field from Firecrawl for ${url}.`);
        }

        if (!mainText || mainText.length < 100) {
          // Add the actual result to the log for debugging lack of content
          console.log(`[DEBUG] Insufficient content after extraction for ${url}:`, JSON.stringify(firecrawlResult, null, 2), `Extracted text length: ${mainText.length}`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'no significant content after extraction' });
          logEvent.status = 'error';
          logEvent.error = 'no significant content after extraction';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Chunk text
        console.log(`[API /api/fetch-url] Attempting to chunk mainText for ${url}. Main text length: ${mainText.length}`);
        const chunks = chunkText(mainText);
        console.log(`[API /api/fetch-url] Text chunked into ${chunks.length} chunks for ${url}.`);

        if (chunks.length === 0) {
          results.push({ url, status: 'error', chunkCount: 0, error: 'no chunks after processing' });
          logEvent.status = 'error';
          logEvent.error = 'no chunks after processing';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // --- Structured Q&A Extraction (ported from extract-url) ---
        console.log(`[API /api/fetch-url] Starting Q&A extraction for ${url}.`);
        let qas: QA[] = [];
        try {
          qas = await extractQAFromTextWithLLM(mainText);
          console.log(`[API /api/fetch-url] Q&A extraction completed for ${url}. Found ${qas.length} Q&A pairs.`);
        } catch (err: any) {
          console.error(`[API /api/fetch-url] Q&A extraction failed for ${url}:`, err.message, err.stack);
          // Decide if this is a fatal error for the URL or if we can continue without Q&As
          logEvent.qaExtractionError = err.message;
          qas = []; // Ensure qas is an empty array to proceed
        }
        
        console.log(`[API /api/fetch-url] Processing ${qas.length} Q&A pairs for ${url}.`);
        for (let i = 0; i < qas.length; i++) {
          const qa = qas[i];
          console.log(`[API /api/fetch-url] Processing Q&A ${i+1}/${qas.length} for ${url}: "${qa.question.substring(0,50)}..."`);
          let embedding = null;
          try {
            console.log(`[API /api/fetch-url] Generating embedding for Q&A ${i+1} question for ${url}.`);
            const embeddingArr = await generateEmbeddings([qa.question]);
            embedding = embeddingArr[0];
            console.log(`[API /api/fetch-url] Embedding generated for Q&A ${i+1} question for ${url}.`);
          } catch (embedErr: any) {
            console.error(`[API /api/fetch-url] Embedding error for Q&A ${i+1} for ${url}:`, embedErr.message, embedErr.stack);
            logEvent.qaEmbeddingError = `Q&A ${i+1}: ${embedErr.message}`;
          }
          
          try {
            console.log(`[API /api/fetch-url] Saving Q&A ${i+1} to 'training' collection for ${url}.`);
            await adminDb.collection('training').add({
              question: qa.question,
              answer: qa.answer,
              sourceUrl: url,
              embedding,
              timestamp: Date.now(),
            });
            console.log(`[API /api/fetch-url] Q&A ${i+1} saved to 'training' collection for ${url}.`);
          } catch (firestoreErr: any) {
            console.error(`[API /api/fetch-url] Firestore error saving Q&A ${i+1} to 'training' for ${url}:`, firestoreErr.message, firestoreErr.stack);
            logEvent.qaTrainingSaveError = `Q&A ${i+1}: ${firestoreErr.message}`;
          }

          try {
            console.log(`[API /api/fetch-url] Saving Q&A ${i+1} to 'trainingEmbeddings' for ${url}.`);
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
            console.log(`[API /api/fetch-url] Q&A ${i+1} saved to 'trainingEmbeddings' for ${url}.`);
          } catch (firestoreEmbedErr: any) {
            console.error(`[API /api/fetch-url] Error saving Q&A ${i+1} to 'trainingEmbeddings' for ${url}:`, firestoreEmbedErr.message, firestoreEmbedErr.stack);
            logEvent.qaUserSaveError = `Q&A ${i+1}: ${firestoreEmbedErr.message}`;
          }
        }
        console.log(`[API /api/fetch-url] Finished processing Q&A pairs for ${url}.`);
        // --- End Q&A Extraction ---

        // Tag classification (limit to 10 chunks)
        const maxChunksForTags = 10; // Declare before use
        console.log(`[API /api/fetch-url] Starting tag classification for ${url}. Processing up to ${maxChunksForTags} chunks.`);
        const tagChunks = chunks.slice(0, maxChunksForTags);
        let tagsArr: string[][] = [];
        for (let i = 0; i < tagChunks.length; i++) {
          const chunkToTag = tagChunks[i];
          console.log(`[API /api/fetch-url] Classifying tags for chunk ${i+1}/${tagChunks.length} for ${url}.`);
          try {
            const tags = await classifyTagsWithOpenAI(chunkToTag);
            tagsArr.push(tags);
            console.log(`[API /api/fetch-url] Tags classified for chunk ${i+1} for ${url}:`, tags);
          } catch (tagErr: any) {
            console.error(`[API /api/fetch-url] Tag classification error for chunk ${i+1} for ${url}:`, tagErr.message, tagErr.stack);
            tagsArr.push(['general', 'tagging-error']); // Default on error
            logEvent.taggingError = `Chunk ${i+1}: ${tagErr.message}`;
          }
        }
        // Fill remaining tags if fewer than 10 chunks were processed for tags
        while (tagsArr.length < chunks.length) {
          tagsArr.push(['general', 'uncategorized']);
        }
        console.log(`[API /api/fetch-url] Tag classification completed for ${url}.`);

        // Embedding and Pinecone upsert
        console.log(`[API /api/fetch-url] Starting chunk embedding generation for ${chunks.length} chunks for ${url}.`);
        let embeddings: number[][] = [];
        try {
          embeddings = await generateEmbeddings(chunks);
          console.log(`[API /api/fetch-url] Chunk embedding generation completed for ${url}. Received ${embeddings.length} embeddings.`);
        } catch (e: any) {
          console.error(`[API /api/fetch-url] Chunk embedding generation failed for ${url}:`, e.message, e.stack);
          results.push({ url, status: 'error', chunkCount: 0, error: 'chunk embedding error' });
          logEvent.status = 'error';
          logEvent.error = `chunk embedding error: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        if (embeddings.length !== chunks.length) {
          console.error(`[API /api/fetch-url] Mismatch between chunk count (${chunks.length}) and embedding count (${embeddings.length}) for ${url}.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'embedding count mismatch' });
          logEvent.status = 'error';
          logEvent.error = 'embedding count mismatch';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        const vectors = chunks.map((chunk: string, i: number) => ({
          id: `${userId}-${Date.now()}-${i}`, // Consider a more deterministic ID if re-processing is common
          values: embeddings[i],
          metadata: {
            userId,
            url,
            chunkIndex: i,
            sourceType: 'web',
            text: chunk, // Storing full chunk text in Pinecone metadata
            tags: tagsArr[i], // Storing tags
          },
        }));

        console.log(`[API /api/fetch-url] Attempting to upsert ${vectors.length} vectors to Pinecone for ${url}.`);
        try {
          await index.upsert(vectors);
          console.log(`[API /api/fetch-url] Successfully upserted ${vectors.length} vectors to Pinecone for ${url}.`);
        } catch (e: any) { 
          console.error(`[API /api/fetch-url] Pinecone upsert failed for ${url}:`, e.message, e.stack);
          results.push({ url, status: 'error', chunkCount: 0, error: `pinecone error: ${e.message || e}` });
          logEvent.status = 'error';
          logEvent.error = `pinecone error: ${e.message || e}`; 
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        // Save metadata to Firestore for each chunk
        console.log(`[API /api/fetch-url] Saving chunk metadata to Firestore for ${url}.`);
        const batch = adminDb.batch();
        vectors.forEach((vec: any, i: number) => { // vec is already typed from map
          const chunkDocId = vec.id; // Use the same ID for Firestore doc as Pinecone vector
          const chunkRef = adminDb.collection('users').doc(userId).collection('urls').doc(chunkDocId);
          // Storing less text in Firestore if full text is in Pinecone, or a summary/preview
          const textPreview = chunks[i].substring(0, 200) + (chunks[i].length > 200 ? '...' : ''); 
          batch.set(chunkRef, {
            userId,
            url,
            pineconeId: chunkDocId, // Link to Pinecone vector
            chunkIndex: i,
            sourceType: 'web',
            textPreview, // Store preview instead of full chunk if it's large and in Pinecone
            // text: chunks[i], // Optionally store full text here too
            tags: tagsArr[i],
            createdAt: Date.now(),
          });
        });
        try {
          await batch.commit();
          console.log(`[API /api/fetch-url] Chunk metadata saved to Firestore for ${url}.`);
        } catch (firestoreBatchErr: any) {
          console.error(`[API /api/fetch-url] Firestore batch commit failed for ${url}:`, firestoreBatchErr.message, firestoreBatchErr.stack);
          // This is tricky, Pinecone succeeded but Firestore failed.
          // Consider compensation logic or just log thoroughly.
          logEvent.status = 'partial_error'; // Custom status
          logEvent.error = `firestore batch commit failed: ${firestoreBatchErr.message}`;
          await adminDb.collection('web_uploads').add(logEvent); // Log the partial error
          // Don't continue to results.push, let it fall through to the main success/error logging for the URL
        }
        
        // If we reached here and logEvent.status is not 'partial_error', it's a success for this URL
        if (logEvent.status !== 'partial_error') {
            results.push({ url, status: 'success', chunkCount: chunks.length });
            logEvent.status = 'success';
            logEvent.chunkCount = chunks.length;
        } else {
            // If it was a partial_error, reflect that in the results sent to client
            results.push({ url, status: 'partial_error', chunkCount: chunks.length, error: logEvent.error });
        }
        logEvent.completedAt = Date.now();
        await adminDb.collection('web_uploads').add(logEvent); // Final log for the URL

      } catch (err: any) {
        console.error(`[API /api/fetch-url] Uncaught processing error for ${url}:`, err.message, err.stack);
        results.push({ url, status: 'error', chunkCount: 0, error: `internal error: ${err.message}` });
        logEvent.status = 'error';
        logEvent.error = `internal error: ${err.message || err}`;
        logEvent.completedAt = Date.now(); // Mark completion time even for errors
        await adminDb.collection('web_uploads').add(logEvent);
      }
    } // End of for loop for URLs

    console.log("[API /api/fetch-url] Finished processing all URLs. Sending response:", results);
    return NextResponse.json({ results });

  } catch (error: any) { 
    console.error('[API /api/fetch-url] Top-level error in POST handler:', error.message, error.stack);
    if (error.message.includes('CRITICAL:')) { 
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error in /api/fetch-url', details: error.message }, { status: 500 });
  }
}

// TODO: Remove extract-url after confirming all clients use fetch-url and Q&A extraction is working as expected.
