import { Router, Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import logger, { sanitizeError } from '@/lib/logger';
import { ApiError } from '@/middleware/errorHandler';
import { adminDb, getAuth } from '@/lib/firebaseAdmin';
import { extractMainContentFromHtml } from '@/lib/extractMainContentFromHtml'; // Import our custom HTML extractor
// import axios from 'axios'; // Replaced by Firecrawl fetch
import { fetchFirecrawlData } from '@/lib/firecrawl'; // Import Firecrawl fetch function
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/lib/ingestion/classifyTagsWithOpenAI';
import { chunkText } from 'shared'; // Corrected import path
import { generateEmbeddings } from '@/lib/embedding';
import { extractQAFromTextWithLLM } from '../../../../../../packages/preprocessing/preprocess';
import { QA } from '../../../../../../packages/preprocessing/types';

// Simulating NextRequest and NextResponse for the existing POST function
interface SimulatedNextRequest {
  headers: { get: (key: string) => string | null | undefined };
  json: () => Promise<any>;
  nextUrl: { pathname: string }; // Add other properties if used by the POST function
  method: string;
}

interface SimulatedNextResponse {
  json: (body: any, init?: { status?: number }) => { body: any; status: number };
}

const NextResponseSimulator: SimulatedNextResponse = {
  json: (body: any, init?: { status?: number }) => {
    return { body, status: init?.status || 200 };
  },
};

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

// This is the original POST function, slightly adapted if needed, or kept as is
async function handleFetchUrlLogic(simulatedReq: SimulatedNextRequest) {
  logger.info(`[API /api/fetch-url (Express)] Received POST request. Headers: ${simulatedReq.headers.get('authorization')}`);
  try {
    const authHeader = simulatedReq.headers.get('authorization');
    let userId: string;

    // Revised authentication logic:
    // 1. If BYPASS_FIREBASE_AUTH is true (intended for development), use a mock user ID.
    // 2. Otherwise, require and verify the Firebase ID token from the Authorization header.
    if (process.env.BYPASS_FIREBASE_AUTH === 'true' && process.env.NODE_ENV === 'development') {
      logger.info('[API /api/fetch-url (Express)] DEVELOPMENT MODE: Firebase Auth skipped via BYPASS_FIREBASE_AUTH ENV.');
      userId = process.env.DEV_USER_ID || 'default-dev-user'; // Standardized default dev user ID
      logger.info('[API /api/fetch-url (Express)] Using mock User ID for development: %s', userId);
    } else {
      // Standard token-based authentication
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[Auth (Express)] Missing or invalid auth token. Ensure Authorization header is set with "Bearer <token>".');
        throw new ApiError(401, 'Missing or invalid authorization token.');
      }
      const idToken = authHeader.split(' ')[1];
      try {
        logger.debug('[Auth (Express)] Verifying ID token...');
        const decodedToken = await getAuth().verifyIdToken(idToken);
        if (!decodedToken || !decodedToken.uid) {
            logger.error('[Auth (Express)] Firebase Auth: UID not found in decoded token.');
            throw new ApiError(401, 'User not found after Firebase auth (UID missing).');
        }
        userId = decodedToken.uid;
        logger.info('[Auth (Express)] Token verified. UserId: %s', userId);
      } catch (e: any) {
        logger.error({ err: e }, '[Auth (Express)] Invalid or expired auth token.');
        throw new ApiError(401, `Invalid or expired auth token: ${e.message}`);
      }
    }

    // This check ensures userId was set, which it should be if no errors were thrown above.
    if (!userId) {
      logger.error('[API /api/fetch-url (Express)] CRITICAL: userId not determined after auth block.');
      throw new ApiError(500, 'Internal Server Error: User ID could not be determined.', false);
    }
    
    logger.info(`[Auth (Express)] Using effective UserId: ${userId}`);

    let urls;
    try {
      const body = await simulatedReq.json();
      urls = body.urls;
      logger.debug({ body }, '[API /api/fetch-url (Express)] Parsed request body');
    } catch (e: any) {
      logger.warn({ err: e }, '[API /api/fetch-url (Express)] Error parsing JSON body.');
      throw new ApiError(400, `Invalid JSON body: ${e.message}`);
    }

    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string' || !u.trim())) {
      logger.warn({ urls }, '[API /api/fetch-url (Express)] Invalid URLs format in request.');
      throw new ApiError(400, 'Invalid URLs format. Expects an array of non-empty strings.');
    }

    // ... (rest of the original POST function's logic remains unchanged) ...
    // --- Environment Variable Checks ---
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX_NAME; // Corrected ENV variable name
    const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;

    if (!openaiApiKey) {
      logger.error('CRITICAL: OPENAI_API_KEY environment variable is not defined in /api/fetch-url (Express).');
      throw new ApiError(500, 'CRITICAL: Server configuration error (OpenAI API Key).', false);
    }
    if (!pineconeApiKey) {
      logger.error('CRITICAL: PINECONE_API_KEY environment variable is not defined in /api/fetch-url (Express).');
      throw new ApiError(500, 'CRITICAL: Server configuration error (Pinecone API Key).', false);
    }
    if (!pineconeIndexName) {
      logger.error('CRITICAL: PINECONE_INDEX_NAME environment variable is not defined in /api/fetch-url (Express).'); // Updated log message
      throw new ApiError(500, 'CRITICAL: Server configuration error (Pinecone Index Name).', false); // Updated error message
    }
    if (!firecrawlApiKey) {
      logger.error('CRITICAL: FIRECRAWL_API_KEY environment variable is not defined (checked in /api/fetch-url (Express)).');
      throw new ApiError(500, 'CRITICAL: Server configuration error (Firecrawl API Key).', false);
    }
    logger.info('[API /api/fetch-url (Express)] All required API keys loaded.');


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
          logger.info({ url }, `[API /api/fetch-url (Express)] Attempting to fetch Firecrawl data for URL.`);
          firecrawlResult = await fetchFirecrawlData(url);
          logger.debug({ url, firecrawlResult: { ...firecrawlResult, content: firecrawlResult.content ? firecrawlResult.content.substring(0, 500) + '...' : null, markdown: firecrawlResult.markdown ? firecrawlResult.markdown.substring(0,500) + '...' : null } }, `[API /api/fetch-url (Express)] Firecrawl result object.`);
          logger.debug({ url }, `[API /api/fetch-url (Express)] BEGIN PREVIEW Firecrawl content (first 1000 chars):`);
          if (firecrawlResult.content) {
            logger.debug(firecrawlResult.content.slice(0, 1000));
          } else {
            logger.debug("[API /api/fetch-url (Express)] firecrawlResult.content is null or undefined");
          }
          logger.debug({ url }, `[API /api/fetch-url (Express)] END PREVIEW Firecrawl content.`);
        } catch (e: any) {
          logger.error({ err: e, url }, `[API /api/fetch-url (Express)] Firecrawl fetch call failed.`);
          results.push({ url, status: 'error', chunkCount: 0, error: `firecrawl fetch failed: ${e.message}` });
          logEvent.status = 'error';
          logEvent.error = `firecrawl fetch failed: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        let mainText = '';
        if (firecrawlResult?.html) {
          logger.info({ url }, `[API /api/fetch-url (Express)] Extracting content from HTML using custom extractor.`);
          mainText = extractMainContentFromHtml(firecrawlResult.html);
          logger.debug({ url }, `[API /api/fetch-url (Express)] BEGIN PREVIEW Custom Extracted content (first 1000 chars):`);
          logger.debug(mainText.slice(0, 1000));
          logger.debug({ url }, `[API /api/fetch-url (Express)] END PREVIEW Custom Extracted content.`);
        } else if (firecrawlResult?.content) {
          logger.info({ url }, `[API /api/fetch-url (Express)] Using Firecrawl's 'content' field as HTML was not available.`);
          mainText = firecrawlResult.content;
          logger.debug({ url }, `[API /api/fetch-url (Express)] BEGIN PREVIEW Firecrawl direct content (first 1000 chars):`);
          logger.debug(mainText.slice(0, 1000));
          logger.debug({ url }, `[API /api/fetch-url (Express)] END PREVIEW Firecrawl direct content.`);
        } else {
          logger.warn({ url }, `[API /api/fetch-url (Express)] No HTML or content field from Firecrawl.`);
        }

        if (!mainText || mainText.length < 100) {
          logger.warn({ url, firecrawlResult, mainTextLength: mainText.length }, `[API /api/fetch-url (Express)] Insufficient content after extraction.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'no significant content after extraction' });
          logEvent.status = 'error';
          logEvent.error = 'no significant content after extraction';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        logger.info({ url, mainTextLength: mainText.length }, `[API /api/fetch-url (Express)] Attempting to chunk mainText.`);
        const chunks = chunkText(mainText);
        logger.info({ url, chunkCount: chunks.length }, `[API /api/fetch-url (Express)] Text chunked.`);

        if (chunks.length === 0) {
          logger.warn({ url }, "[API /api/fetch-url (Express)] No chunks after processing.");
          results.push({ url, status: 'error', chunkCount: 0, error: 'no chunks after processing' });
          logEvent.status = 'error';
          logEvent.error = 'no chunks after processing';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }
        logger.info({ url }, `[API /api/fetch-url (Express)] Starting Q&A extraction.`);
        let qas: QA[] = [];
        try {
          qas = await extractQAFromTextWithLLM(mainText);
          logger.info({ url, qaCount: qas.length }, `[API /api/fetch-url (Express)] Q&A extraction completed.`);
        } catch (err: any) {
          logger.error({ err, url }, `[API /api/fetch-url (Express)] Q&A extraction failed.`);
          logEvent.qaExtractionError = err.message;
          qas = [];
        }
        
        logger.info({ url, qaCount: qas.length }, `[API /api/fetch-url (Express)] Processing Q&A pairs.`);
        const qaPineconeVectors: any[] = [];

        for (let i = 0; i < qas.length; i++) {
          const qa = qas[i];
          logger.debug({ url, qaIndex: i + 1, totalQas: qas.length, questionPreview: qa.question.substring(0,50) }, `[API /api/fetch-url (Express)] Processing Q&A.`);
          let embedding: number[] | null = null;
          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Generating embedding for Q&A question.`);
            const embeddingArr = await generateEmbeddings([qa.question]);
            embedding = embeddingArr[0];
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Embedding generated for Q&A question.`);
          } catch (embedErr: any) {
            logger.error({ err: embedErr, url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Embedding error for Q&A.`);
            logEvent.qaEmbeddingError = `Q&A ${i+1}: ${embedErr.message}`;
          }
          
          if (embedding) {
            qaPineconeVectors.push({
              id: `qa-${userId}-${Date.now()}-url-${i}`,
              values: embedding,
              metadata: { userId, originalSourceUrl: url, sourceType: 'qa', question: qa.question, answer: qa.answer },
            });
          }

          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Saving Q&A to 'training' collection.`);
            await adminDb.collection('training').add({ question: qa.question, answer: qa.answer, sourceUrl: url, embedding, timestamp: Date.now() });
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Q&A saved to 'training' collection.`);
          } catch (firestoreErr: any) {
            logger.error({ err: firestoreErr, url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Firestore error saving Q&A to 'training'.`);
            logEvent.qaTrainingSaveError = `Q&A ${i+1}: ${firestoreErr.message}`;
          }

          try {
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Saving Q&A to 'trainingEmbeddings'.`);
            await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').add({ question: qa.question, answer: qa.answer, sourceUrl: url, embedding, timestamp: Date.now() });
            logger.debug({ url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Q&A saved to 'trainingEmbeddings'.`);
          } catch (firestoreEmbedErr: any) {
            logger.error({ err: firestoreEmbedErr, url, qaIndex: i + 1 }, `[API /api/fetch-url (Express)] Error saving Q&A to 'trainingEmbeddings'.`);
            logEvent.qaUserSaveError = `Q&A ${i+1}: ${firestoreEmbedErr.message}`;
          }
        }
        logger.info({ url }, `[API /api/fetch-url (Express)] Finished processing Q&A pairs.`);

        if (qaPineconeVectors.length > 0) {
          logger.info({ url, count: qaPineconeVectors.length }, `[API /api/fetch-url (Express)] Attempting to upsert Q&A vectors to Pinecone namespace: user-${userId}`);
          try {
            await index.upsert(qaPineconeVectors);
            logger.info({ url, count: qaPineconeVectors.length }, `[API /api/fetch-url (Express)] Successfully reported upsert for Q&A vectors to Pinecone namespace: user-${userId}.`);
            
            // Log namespace stats after upsert
            const stats = await index.describeIndexStats();
            logger.info({ namespace: `user-${userId}`, stats: stats.namespaces?.[`user-${userId}`] }, `[API /api/fetch-url (Express)] Pinecone namespace stats after Q&A upsert.`);
            logEvent.qaPineconeUpsertCount = qaPineconeVectors.length;
          } catch (e: any) {
            logger.error({ err: e, url, namespace: `user-${userId}` }, `[API /api/fetch-url (Express)] Pinecone upsert failed for Q&A vectors.`);
            logEvent.qaPineconeUpsertError = `pinecone Q&A error: ${e.message || e}`;
          }
        } else {
          logger.info({ url }, `[API /api/fetch-url (Express)] No Q&A vectors to upsert to Pinecone.`);
        }

        const maxChunksForTags = 10;
        logger.info({ url, maxChunksForTags }, `[API /api/fetch-url (Express)] Starting tag classification.`);
        const tagChunks = chunks.slice(0, maxChunksForTags);
        let tagsArr: string[][] = [];
        for (let i = 0; i < tagChunks.length; i++) {
          const chunkToTag = tagChunks[i];
          logger.debug({ url, chunkIndex: i + 1, totalTagChunks: tagChunks.length }, `[API /api/fetch-url (Express)] Classifying tags for chunk.`);
          try {
            const tags = await classifyTagsWithOpenAI(chunkToTag);
            tagsArr.push(tags);
            logger.debug({ url, chunkIndex: i + 1, tags }, `[API /api/fetch-url (Express)] Tags classified for chunk.`);
          } catch (tagErr: any) {
            logger.error({ err: tagErr, url, chunkIndex: i + 1 }, `[API /api/fetch-url (Express)] Tag classification error for chunk.`);
            tagsArr.push(['general', 'tagging-error']);
            logEvent.taggingError = `Chunk ${i+1}: ${tagErr.message}`;
          }
        }
        while (tagsArr.length < chunks.length) {
          tagsArr.push(['general', 'uncategorized']);
        }
        logger.info({ url }, `[API /api/fetch-url (Express)] Tag classification completed.`);

        logger.info({ url, chunkCount: chunks.length }, `[API /api/fetch-url (Express)] Starting chunk embedding generation.`);
        let embeddings: number[][] = [];
        try {
          embeddings = await generateEmbeddings(chunks);
          logger.info({ url, embeddingCount: embeddings.length }, `[API /api/fetch-url (Express)] Chunk embedding generation completed.`);
        } catch (e: any) {
          logger.error({ err: e, url }, `[API /api/fetch-url (Express)] Chunk embedding generation failed.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'chunk embedding error' });
          logEvent.status = 'error';
          logEvent.error = `chunk embedding error: ${e.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        if (embeddings.length !== chunks.length) {
          logger.error({ url, chunkCount: chunks.length, embeddingCount: embeddings.length }, `[API /api/fetch-url (Express)] Mismatch between chunk count and embedding count.`);
          results.push({ url, status: 'error', chunkCount: 0, error: 'embedding count mismatch' });
          logEvent.status = 'error';
          logEvent.error = 'embedding count mismatch';
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        const vectors = chunks.map((chunk: string, i: number) => ({
          id: `${userId}-${Date.now()}-${i}`,
          values: embeddings[i],
          metadata: { userId, url, chunkIndex: i, sourceType: 'web', text: chunk, tags: tagsArr[i] },
        }));

        logger.info({ url, vectorCount: vectors.length }, `[API /api/fetch-url (Express)] Attempting to upsert main content vectors to Pinecone namespace: user-${userId}.`);
        try {
          await index.upsert(vectors);
          logger.info({ url, vectorCount: vectors.length }, `[API /api/fetch-url (Express)] Successfully reported upsert for main content vectors to Pinecone namespace: user-${userId}.`);
          
          // Log namespace stats after upsert
          const stats = await index.describeIndexStats();
          logger.info({ namespace: `user-${userId}`, stats: stats.namespaces?.[`user-${userId}`] }, `[API /api/fetch-url (Express)] Pinecone namespace stats after main content upsert.`);
        } catch (e: any) { 
          logger.error({ err: e, url, namespace: `user-${userId}` }, `[API /api/fetch-url (Express)] Pinecone upsert failed for main content vectors.`);
          results.push({ url, status: 'error', chunkCount: 0, error: `pinecone error: ${e.message || e}` });
          logEvent.status = 'error';
          logEvent.error = `pinecone error: ${e.message || e}`; 
          await adminDb.collection('web_uploads').add(logEvent);
          continue;
        }

        logger.info({ url }, `[API /api/fetch-url (Express)] Saving chunk metadata to Firestore.`);
        const batch = adminDb.batch();
        vectors.forEach((vec: any, i: number) => {
          const chunkDocId = vec.id;
          const chunkRef = adminDb.collection('users').doc(userId).collection('urls').doc(chunkDocId);
          const textPreview = chunks[i].substring(0, 200) + (chunks[i].length > 200 ? '...' : ''); 
          batch.set(chunkRef, { userId, url, pineconeId: chunkDocId, chunkIndex: i, sourceType: 'web', textPreview, tags: tagsArr[i], createdAt: Date.now() });
        });
        try {
          await batch.commit();
          logger.info({ url }, `[API /api/fetch-url (Express)] Chunk metadata saved to Firestore.`);
        } catch (firestoreBatchErr: any) {
          logger.error({ err: firestoreBatchErr, url }, `[API /api/fetch-url (Express)] Firestore batch commit failed.`);
          logEvent.status = 'partial_error';
          logEvent.error = `firestore batch commit failed: ${firestoreBatchErr.message}`;
          await adminDb.collection('web_uploads').add(logEvent);
        }
        
        if (logEvent.status !== 'partial_error') {
            results.push({ url, status: 'success', chunkCount: chunks.length });
            logEvent.status = 'success';
            logEvent.chunkCount = chunks.length;
        } else {
            results.push({ url, status: 'partial_error', chunkCount: chunks.length, error: logEvent.error });
        }
        logEvent.completedAt = Date.now();
        await adminDb.collection('web_uploads').add(logEvent);

      } catch (err: any) {
        logger.error({ err, url, logEvent }, `[API /api/fetch-url (Express)] Uncaught processing error for URL.`);
        results.push({ url, status: 'error', chunkCount: 0, error: `internal error: ${err.message}` });
        if (logEvent.status !== 'error' && logEvent.status !== 'partial_error') {
          logEvent.status = 'error';
          logEvent.error = `internal error: ${err.message || err}`;
        }
        logEvent.completedAt = Date.now();
        try {
            await adminDb.collection('web_uploads').add(logEvent);
        } catch (dbErr) {
            logger.error({ err: dbErr, originalError: err, url }, "Failed to log error event to web_uploads (Express)");
        }
      }
    }

    logger.info({ results }, "[API /api/fetch-url (Express)] Finished processing all URLs. Sending response.");
    return NextResponseSimulator.json({ results });

  } catch (error: any) { 
    // This catch is for errors thrown directly by the main try block (e.g., auth, body parsing)
    // or if handleFetchUrlLogic itself throws an ApiError that wasn't caught internally.
    logger.error({ err: error, path: simulatedReq.nextUrl?.pathname || '/api/v1/fetch-url', method: simulatedReq.method || 'POST' }, 'Top-level error in handleFetchUrlLogic (Express)');
    
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    const sanitized = sanitizeError(error);

    return NextResponseSimulator.json(
      { status: statusCode >= 500 ? 'error' : 'fail', ...sanitized },
      { status: statusCode }
    );
  }
}

const fetchUrlRouter = Router();

fetchUrlRouter.post('/', async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  // Adapt Express req to SimulatedNextRequest
  const simulatedReq: SimulatedNextRequest = {
    headers: {
      get: (key: string) => req.headers[key.toLowerCase()] as string | undefined,
    },
    json: async () => req.body, // Assumes express.json() middleware is used
    nextUrl: { pathname: req.path }, // Basic mapping
    method: req.method,
  };

  try {
    const result = await handleFetchUrlLogic(simulatedReq);
    res.status(result.status).json(result.body);
  } catch (error) {
    // If handleFetchUrlLogic throws an unhandled error (not an ApiError it converted to a response)
    // or if the ApiError handling itself fails to produce a response object.
    // This is a fallback. Most errors should be handled by handleFetchUrlLogic and returned as a response object.
    logger.error({ err: error }, "Error in Express wrapper for fetchUrlRouter POST");
    // Pass to global Express error handler
    if (error instanceof ApiError) {
        next(error); // Pass ApiError to Express error handler
    } else if (error instanceof Error) {
        // Corrected: ApiError constructor takes 3 arguments
        next(new ApiError(500, `Unhandled error in fetch URL processing: ${error.message}`, false));
    } else {
        next(new ApiError(500, 'Unknown unhandled error in fetch URL processing', false));
    }
  }
});

export default fetchUrlRouter;
