import { NextRequest, NextResponse } from 'next/server';
import logger, { sanitizeError } from '@/lib/logger';
import { ApiError } from '@/middleware/errorHandler';
import { adminDb, getAuth } from '@/lib/firebaseAdmin'; // Combined and updated import
import { extractMainContentFromHtml } from '@/lib/extractMainContentFromHtml'; // Import our custom HTML extractor
// import axios from 'axios'; // Replaced by Firecrawl fetch
import { fetchFirecrawlData } from '@/lib/firecrawl'; // Import Firecrawl fetch function
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/lib/ingestion/classifyTagsWithOpenAI';
import { chunkText } from '@/lib/chunkText'; // Assuming this is the correct one, alternative is 'shared/chunkText'
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
  logger.debug({ userId, url }, '[Auth] Checking if URL is indexed');
  const snapshot = await adminDb
    .collection('web_uploads')
    .where('userId', '==', userId)
    .where('url', '==', url)
    .limit(1)
    .get();
  return !snapshot.empty;
}

export async function POST(req: NextRequest) {
  logger.info(`[API /api/fetch-url] Received POST request. Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`);
  try {
    // This initial try block is for the main processing logic.
    // Specific early exits (auth, body parsing) will throw ApiError.
    const authHeader = req.headers.get('authorization');
    let userId: string;

    if (process.env.NODE_ENV === 'development') {
      userId = 'dev-user-id'; // Align with chat and pdf processing for dev
      logger.info('[API /api/fetch-url] DEVELOPMENT MODE: Using userId: %s', userId);
    } else {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[Auth] Missing or invalid auth token in non-dev environment.');
        throw new ApiError(401, 'Missing or invalid authorization token.');
      }
      const idToken = authHeader.split(' ')[1];
      try {
        logger.debug('[Auth] Verifying ID token...');
        const decoded = await getAuth().verifyIdToken(idToken);
        userId = decoded.uid;
        logger.info('[Auth] Token verified. UserId: %s', userId);
        if (!userId) {
          logger.error('[Auth] UserID not found in decoded token.');
          throw new ApiError(401, 'User not found after token verification.');
        }
      } catch (e: any) {
        logger.error({ err: e }, '[Auth] Invalid or expired auth token.');
        throw new ApiError(401, `Invalid or expired auth token: ${e.message}`);
      }
    }

    if (!userId) { // Should be caught by earlier checks, but as a safeguard
      logger.error('[API /api/fetch-url] CRITICAL: userId not determined after auth block.');
      throw new ApiError(500, 'Internal Server Error: User ID could not be determined.', false);
    }
    
    logger.info(`[Auth] Using effective UserId: ${userId}`);

    // Parse body
    let urls;
    try {
      const body = await req.json();
      urls = body.urls;
      logger.debug({ body }, '[API /api/fetch-url] Parsed request body');
    } catch (e: any) {
      logger.warn({ err: e }, '[API /api/fetch-url] Error parsing JSON body.');
      throw new ApiError(400, `Invalid JSON body: ${e.message}`);
    }

    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string' || !u.trim())) {
      logger.warn({ urls }, '[API /api/fetch-url] Invalid URLs format in request.');
      throw new ApiError(400, 'Invalid URLs format. Expects an array of non-empty strings.');
    }

    // --- Environment Variable Checks ---
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

    if (!openaiApiKey) {
      logger.error('CRITICAL: OPENAI_API_KEY environment variable is not defined in /api/fetch-url.');
      throw new ApiError(500, 'CRITICAL: Server configuration error (OpenAI API Key).', false);
    }
    if (!pineconeApiKey) {
      logger.error('CRITICAL: PINECONE_API_KEY environment variable is not defined in /api/fetch-url.');
      throw new ApiError(500, 'CRITICAL: Server configuration error (Pinecone API Key).', false);
    }
    if (!pineconeIndexName) {
      logger.error('CRITICAL: PINECONE_INDEX environment variable is not defined in /api/fetch-url.');
      throw new ApiError(500, 'CRITICAL: Server configuration error (Pinecone Index).', false);
    }
    if (!firecrawlApiKey) {
      logger.error('CRITICAL: FIRECRAWL_API_KEY environment variable is not defined (checked in /api/fetch-url).');
      throw new ApiError(500, 'CRITICAL: Server configuration error (Firecrawl API Key).', false);
    }
    logger.info('[API /api/fetch-url] All required API keys loaded.');


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
          logger.info({ url }, `[API /api/fetch-url] Attempting to fetch Firecrawl data for URL.`);
          // Use the fetchFirecrawlData function from src/lib/firecrawl.ts
          firecrawlResult = await fetchFirecrawlData(url);
          logger.debug({ url, firecrawlResult: { ...firecrawlResult, content: firecrawlResult.content ? firecrawlResult.content.substring(0, 500) + '...' : null, markdown: firecrawlResult.markdown ? firecrawlResult.markdown.substring(0,500) + '...' : null } }, `[API /api/fetch-url] Firecrawl result object.`);
          // Log a preview of the content separately as requested for debugging
          logger.debug({ url }, `[API /api/fetch-url] BEGIN PREVIEW Firecrawl content (first 1000 chars):`);
          if (firecrawlResult.content) {
            logger.debug(firecrawlResult.content.slice(0, 1000));
          } else {
            logger.debug("[API /api/fetch-url] firecrawlResult.content is null or undefined");
          }
          logger.debug({ url }, `[API /api/fetch-url] END PREVIEW Firecrawl content.`);
        } catch (e: any) {
          logger.error({ err: e, url }, `[API /api/fetch-url] Firecrawl fetch call failed.`);
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
          logger.info({ url }, `[API /api/fetch-url] Extracting content from HTML using custom extractor.`);
          mainText = extractMainContentFromHtml(firecrawlResult.html);
          // Log preview of custom extracted text
          logger.debug({ url }, `[API /api/fetch-url] BEGIN PREVIEW Custom Extracted content (first 1000 chars):`);
          logger.debug(mainText.slice(0, 1000));
          logger.debug({ url }, `[API /api/fetch-url] END PREVIEW Custom Extracted content.`);
        } else if (firecrawlResult?.content) {
          logger.info({ url }, `[API /api/fetch-url] Using Firecrawl's 'content' field as HTML was not available.`);
          mainText = firecrawlResult.content;
           // Log preview of Firecrawl's direct content
          logger.debug({ url }, `[API /api/fetch-url] BEGIN PREVIEW Firecrawl direct content (first 1000 chars):`);
          logger.debug(mainText.slice(0, 1000));
          logger.debug({ url }, `[API /api/fetch-url] END PREVIEW Firecrawl direct content.`);
        } else {
          logger.warn({ url }, `[API /api/fetch-url] No HTML or content field from Firecrawl.`);
        }

        if (!mainText || mainText.length < 100) {
          // Add the actual result to the log for debugging lack of content
          logger.warn({ url, firecrawlResult, mainTextLength: mainText.length }, `[API /api/fetch-url] Insufficient content after extraction.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'no significant content after extraction' });
          logEvent.status = 'error';
          logEvent.error = 'no significant content after extraction';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // Chunk text
        logger.info({ url, mainTextLength: mainText.length }, `[API /api/fetch-url] Attempting to chunk mainText.`);
        const chunks = chunkText(mainText);
        logger.info({ url, chunkCount: chunks.length }, `[API /api/fetch-url] Text chunked.`);

        if (chunks.length === 0) {
          logger.warn({ url }, "[API /api/fetch-url] No chunks after processing.");
          results.push({ url, status: 'error', chunkCount: 0, error: 'no chunks after processing' });
          logEvent.status = 'error';
          logEvent.error = 'no chunks after processing';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        // --- Structured Q&A Extraction (ported from extract-url) ---
        logger.info({ url }, `[API /api/fetch-url] Starting Q&A extraction.`);
        let qas: QA[] = [];
        try {
          qas = await extractQAFromTextWithLLM(mainText);
          logger.info({ url, qaCount: qas.length }, `[API /api/fetch-url] Q&A extraction completed.`);
        } catch (err: any) {
          logger.error({ err, url }, `[API /api/fetch-url] Q&A extraction failed.`);
          // Decide if this is a fatal error for the URL or if we can continue without Q&As
          logEvent.qaExtractionError = err.message;
          qas = []; // Ensure qas is an empty array to proceed
        }
        
        logger.info({ url, qaCount: qas.length }, `[API /api/fetch-url] Processing Q&A pairs.`);
        const qaPineconeVectors: any[] = []; // Initialize array for Q&A Pinecone vectors

        for (let i = 0; i < qas.length; i++) {
          const qa = qas[i];
          logger.debug({ url, qaIndex: i + 1, totalQas: qas.length, questionPreview: qa.question.substring(0,50) }, `[API /api/fetch-url] Processing Q&A.`);
          let embedding: number[] | null = null; // Ensure embedding is typed correctly
          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Generating embedding for Q&A question.`);
            const embeddingArr = await generateEmbeddings([qa.question]);
            embedding = embeddingArr[0]; // embeddingArr is number[][], so embeddingArr[0] is number[]
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Embedding generated for Q&A question.`);
          } catch (embedErr: any) {
            logger.error({ err: embedErr, url, qaIndex: i + 1 }, `[API /api/fetch-url] Embedding error for Q&A.`);
            logEvent.qaEmbeddingError = `Q&A ${i+1}: ${embedErr.message}`;
            // Continue to next Q&A if embedding fails for this one
          }
          
          // If embedding was successful, prepare Pinecone vector for this Q&A
          if (embedding) {
            qaPineconeVectors.push({
              id: `qa-${userId}-${Date.now()}-url-${i}`, // Unique ID for Q&A vector
              values: embedding,
              metadata: {
                userId,
                originalSourceUrl: url, // URL of the webpage
                sourceType: 'qa',
                question: qa.question,
                answer: qa.answer,
                // originalFilename: null, // Not applicable for URL fetches, but good to be explicit if schema expects it
              },
            });
          }

          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Saving Q&A to 'training' collection.`);
            await adminDb.collection('training').add({
              question: qa.question,
              answer: qa.answer,
              sourceUrl: url,
              embedding,
              timestamp: Date.now(),
            });
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Q&A saved to 'training' collection.`);
          } catch (firestoreErr: any) {
            logger.error({ err: firestoreErr, url, qaIndex: i + 1 }, `[API /api/fetch-url] Firestore error saving Q&A to 'training'.`);
            logEvent.qaTrainingSaveError = `Q&A ${i+1}: ${firestoreErr.message}`;
          }

          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Saving Q&A to 'trainingEmbeddings'.`);
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
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url] Q&A saved to 'trainingEmbeddings'.`);
          } catch (firestoreEmbedErr: any) {
            logger.error({ err: firestoreEmbedErr, url, qaIndex: i + 1 }, `[API /api/fetch-url] Error saving Q&A to 'trainingEmbeddings'.`);
            logEvent.qaUserSaveError = `Q&A ${i+1}: ${firestoreEmbedErr.message}`;
          }
        }
        logger.info({ url }, `[API /api/fetch-url] Finished processing Q&A pairs.`);

        // Upsert Q&A vectors to Pinecone
        if (qaPineconeVectors.length > 0) {
          logger.info({ url, count: qaPineconeVectors.length }, `[API /api/fetch-url] Attempting to upsert Q&A vectors to Pinecone.`);
          try {
            await index.upsert(qaPineconeVectors);
            logger.info({ url, count: qaPineconeVectors.length }, `[API /api/fetch-url] Successfully upserted Q&A vectors to Pinecone.`);
            logEvent.qaPineconeUpsertCount = qaPineconeVectors.length;
          } catch (e: any) {
            logger.error({ err: e, url }, `[API /api/fetch-url] Pinecone upsert failed for Q&A vectors.`);
            logEvent.qaPineconeUpsertError = `pinecone Q&A error: ${e.message || e}`;
            // Decide if this is critical enough to mark the whole URL processing as an error or partial_error
            // For now, we'll log it and continue with chunk processing.
          }
        } else {
          logger.info({ url }, `[API /api/fetch-url] No Q&A vectors to upsert to Pinecone.`);
        }
        // --- End Q&A Extraction & Pinecone Upsert ---

        // Tag classification (limit to 10 chunks)
        const maxChunksForTags = 10; // Declare before use
        logger.info({ url, maxChunksForTags }, `[API /api/fetch-url] Starting tag classification.`);
        const tagChunks = chunks.slice(0, maxChunksForTags);
        let tagsArr: string[][] = [];
        for (let i = 0; i < tagChunks.length; i++) {
          const chunkToTag = tagChunks[i];
          logger.debug({ url, chunkIndex: i + 1, totalTagChunks: tagChunks.length }, `[API /api/fetch-url] Classifying tags for chunk.`);
          try {
            const tags = await classifyTagsWithOpenAI(chunkToTag);
            tagsArr.push(tags);
            logger.debug({ url, chunkIndex: i + 1, tags }, `[API /api/fetch-url] Tags classified for chunk.`);
          } catch (tagErr: any) {
            logger.error({ err: tagErr, url, chunkIndex: i + 1 }, `[API /api/fetch-url] Tag classification error for chunk.`);
            tagsArr.push(['general', 'tagging-error']); // Default on error
            logEvent.taggingError = `Chunk ${i+1}: ${tagErr.message}`;
          }
        }
        // Fill remaining tags if fewer than 10 chunks were processed for tags
        while (tagsArr.length < chunks.length) {
          tagsArr.push(['general', 'uncategorized']);
        }
        logger.info({ url }, `[API /api/fetch-url] Tag classification completed.`);

        // Embedding and Pinecone upsert
        logger.info({ url, chunkCount: chunks.length }, `[API /api/fetch-url] Starting chunk embedding generation.`);
        let embeddings: number[][] = [];
        try {
          embeddings = await generateEmbeddings(chunks);
          logger.info({ url, embeddingCount: embeddings.length }, `[API /api/fetch-url] Chunk embedding generation completed.`);
        } catch (e: any) {
          logger.error({ err: e, url }, `[API /api/fetch-url] Chunk embedding generation failed.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'chunk embedding error' });
          logEvent.status = 'error';
          logEvent.error = `chunk embedding error: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        if (embeddings.length !== chunks.length) {
          logger.error({ url, chunkCount: chunks.length, embeddingCount: embeddings.length }, `[API /api/fetch-url] Mismatch between chunk count and embedding count.`);
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

        logger.info({ url, vectorCount: vectors.length }, `[API /api/fetch-url] Attempting to upsert vectors to Pinecone.`);
        try {
          await index.upsert(vectors);
          logger.info({ url, vectorCount: vectors.length }, `[API /api/fetch-url] Successfully upserted vectors to Pinecone.`);
        } catch (e: any) { 
          logger.error({ err: e, url }, `[API /api/fetch-url] Pinecone upsert failed.`);
          results.push({ url, status: 'error', chunkCount: 0, error: `pinecone error: ${e.message || e}` });
          logEvent.status = 'error';
          logEvent.error = `pinecone error: ${e.message || e}`; 
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        // Save metadata to Firestore for each chunk
        logger.info({ url }, `[API /api/fetch-url] Saving chunk metadata to Firestore.`);
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
          logger.info({ url }, `[API /api/fetch-url] Chunk metadata saved to Firestore.`);
        } catch (firestoreBatchErr: any) {
          logger.error({ err: firestoreBatchErr, url }, `[API /api/fetch-url] Firestore batch commit failed.`);
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
        logger.error({ err, url, logEvent }, `[API /api/fetch-url] Uncaught processing error for URL.`);
        results.push({ url, status: 'error', chunkCount: 0, error: `internal error: ${err.message}` });
        // Ensure logEvent is updated before saving if it hasn't been
        if (logEvent.status !== 'error' && logEvent.status !== 'partial_error') {
          logEvent.status = 'error';
          logEvent.error = `internal error: ${err.message || err}`;
        }
        logEvent.completedAt = Date.now(); // Mark completion time even for errors
        try {
            await adminDb.collection('web_uploads').add(logEvent);
        } catch (dbErr) {
            logger.error({ err: dbErr, originalError: err, url }, "Failed to log error event to web_uploads");
        }
      }
    } // End of for loop for URLs

    logger.info({ results }, "[API /api/fetch-url] Finished processing all URLs. Sending response.");
    return NextResponse.json({ results });

  } catch (error: any) { 
    logger.error({ err: error, path: req.nextUrl.pathname, method: req.method }, 'Top-level error in POST /api/fetch-url');
    
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    const sanitized = sanitizeError(error);

    return NextResponse.json(
      { 
        status: statusCode >= 500 ? 'error' : 'fail',
        ...sanitized
      },
      { status: statusCode }
    );
  }
}

// TODO: Remove extract-url after confirming all clients use fetch-url and Q&A extraction is working as expected.
