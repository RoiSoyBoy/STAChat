import { NextRequest, NextResponse } from 'next/server';
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.js'; // Using legacy CommonJS build for Node.js as per user instruction

// Removed worker setup as per user instruction for Node.js legacy build.

import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { adminDb, getAuth } from '@/lib/firebaseAdmin'; // Combined and updated import
import { headers } from 'next/headers';
// import { Readable } from 'stream'; // Likely not needed with pdfjs-dist
import { classifyTagsWithOpenAI } from '@/lib/ingestion/classifyTagsWithOpenAI';
import { chunkText } from '@/lib/chunkText'; // Assuming local backend version
import { generateEmbeddings } from '@/lib/embedding';
import { extractQAFromTextWithLLM, QA } from '@/lib/preprocess'; // For Q&A generation
import logger, { sanitizeError } from '@/lib/logger';
import { ApiError } from '@/middleware/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function extractTextFromPdfWithPdfjs(buffer: ArrayBuffer): Promise<string> {
  // Access the actual library object, which might be on .default with esModuleInterop
  const lib = pdfjsNamespace.default || pdfjsNamespace;

  // For Node.js, pdfjs-dist (even legacy build v2.16.105) might try to load its worker script
  // for its "fake worker" mechanism. If its internal relative path resolution fails after bundling,
  // we need to explicitly provide the path to the worker script.
  if (typeof window === 'undefined' && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    try {
      // Try setting workerSrc to the module path string directly.
      // Webpack, when resolving the require() call inside pdf.js, might handle this module path
      // more cleanly from node_modules than an absolute path from require.resolve()
      // which seems to get mangled in the RSC/bundling context.
      lib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
    } catch (e: any) {
      // This catch block might not be hit if the error is in pdf.js's internal require.
      logger.error({ err: e }, "Error assigning workerSrc string for pdfjs-dist legacy");
    }
  }

  const loadingTask = lib.getDocument({ data: buffer });
  const pdfDocument = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n'; // Add newline between pages
  }
  return fullText.trim();
}

export async function POST(req: NextRequest) {
  logger.info('[process-pdf PDFJS-DIST] POST handler entered');
  try {
    let userId: string;

    // --- DEVELOPMENT ONLY: Firebase Auth Bypass ---
    // TODO: Remove this block and re-enable Firebase Auth before production!
    // This is for testing purposes only to bypass Firebase Auth in development.
    if (process.env.NODE_ENV === 'development') {
      logger.info('[process-pdf PDFJS-DIST] DEVELOPMENT MODE: Firebase Auth skipped.');
      userId = 'dev-user-id'; // Using a mock user ID for development
      logger.info('[process-pdf PDFJS-DIST] Using mock User ID for development: %s', userId);
    } else {
      // Production Firebase Auth logic
      logger.info('[process-pdf PDFJS-DIST] Verifying Firebase Auth...');
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[process-pdf PDFJS-DIST] Missing or invalid auth token.');
        throw new ApiError(401, 'Missing or invalid authorization token.');
      }
      const idToken = authHeader.split(' ')[1];
      let decodedToken;
      try {
        decodedToken = await getAuth().verifyIdToken(idToken);
      } catch (e: any) {
        logger.error({ err: e }, '[process-pdf PDFJS-DIST] Firebase Auth token verification failed.');
        throw new ApiError(401, `Invalid or expired auth token: ${e.message}`);
      }
      if (!decodedToken || !decodedToken.uid) { // Check if decodedToken or uid is null/undefined
        logger.error('[process-pdf PDFJS-DIST] Firebase Auth: UID not found in token.');
        throw new ApiError(401, 'User not found after auth (UID missing).');
      }
      userId = decodedToken.uid;
      logger.info('[process-pdf PDFJS-DIST] Firebase Auth verified. User ID: %s', userId);
    }
    // --- END DEVELOPMENT ONLY ---

    // Ensure userId is set, otherwise critical operations will fail.
    if (!userId) { // Safeguard
        logger.error('[process-pdf PDFJS-DIST] CRITICAL: userId not set after auth block.');
        throw new ApiError(500, 'Internal server error: User ID not determined.', false);
    }

    // --- Initialize Pinecone Client Once ---
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;

    if (!pineconeApiKey || !pineconeIndexName) {
        logger.error('[process-pdf PDFJS-DIST] CRITICAL: Pinecone API Key or Index not configured.');
        throw new ApiError(500, 'CRITICAL: Server configuration error (Pinecone).', false);
    }
    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const pineconeIndex = pinecone.index(pineconeIndexName).namespace(`user-${userId}`);
    // --- End Pinecone Client Initialization ---

    logger.info('[process-pdf PDFJS-DIST] Parsing form data using req.formData()...');
    const formData = await req.formData();
    const fileEntry = formData.get('file') as File | null;

    if (!fileEntry || typeof fileEntry === 'string') {
      logger.warn('[process-pdf PDFJS-DIST] No file found in FormData.');
      throw new ApiError(400, 'No PDF file uploaded.');
    }
    
    if (fileEntry.type !== 'application/pdf') {
        logger.warn(`[process-pdf PDFJS-DIST] Invalid file type: ${fileEntry.type}.`);
        throw new ApiError(400, `Invalid file type: ${fileEntry.type}. Only PDF files are allowed.`);
    }

    const originalFilename = sanitizeFilename(fileEntry.name || `document-${Date.now()}.pdf`);
    logger.info('[process-pdf PDFJS-DIST] Form data parsed. Original filename: %s', originalFilename);

    logger.info('[process-pdf PDFJS-DIST] Reading PDF ArrayBuffer from File object...');
    const arrayBuffer = await fileEntry.arrayBuffer(); // Use ArrayBuffer directly for pdfjs-dist

    let text: string;
    try {
      logger.info('[process-pdf PDFJS-DIST] Parsing PDF content with pdfjs-dist...');
      text = await extractTextFromPdfWithPdfjs(arrayBuffer);
    } catch (e: any) {
      logger.error({ err: e, filename: originalFilename }, '[process-pdf PDFJS-DIST] Error parsing PDF with pdfjs-dist.');
      throw new ApiError(400, `Failed to parse PDF with pdfjs-dist. ${e.message || ''}`.trim());
    }
    
    if (!text) {
      logger.warn('[process-pdf PDFJS-DIST] No extractable text found by pdfjs-dist for %s.', originalFilename);
      throw new ApiError(400, 'No extractable text found in PDF.');
    }
    logger.info('[process-pdf PDFJS-DIST] pdfjs-dist successful. Extracted text length: %d for %s.', text.length, originalFilename);

    // --- Q&A Extraction and Storage (similar to fetch-url) ---
    logger.info(`[process-pdf PDFJS-DIST] Starting Q&A extraction for ${originalFilename}.`);
    let qas: QA[] = [];
    if (text && text.trim().length > 0) { // Ensure there is text to process
        try {
            qas = await extractQAFromTextWithLLM(text); // Use the full PDF text
            logger.info(`[process-pdf PDFJS-DIST] Q&A extraction completed for ${originalFilename}. Found ${qas.length} Q&A pairs.`);
        } catch (err: any) {
            logger.error({ err, filename: originalFilename }, `[process-pdf PDFJS-DIST] Q&A extraction failed.`);
            // Log error, qas remains empty, proceed with main content ingestion
        }

        if (qas.length > 0) {
            logger.info(`[process-pdf PDFJS-DIST] Processing ${qas.length} Q&A pairs for ${originalFilename}.`);
            for (const qa of qas) {
                let qaEmbedding = null;
                try {
                    logger.debug(`[process-pdf PDFJS-DIST] Generating embedding for Q&A question: "${qa.question.substring(0, 50)}..."`);
                    const embeddingArr = await generateEmbeddings([qa.question]);
                    qaEmbedding = embeddingArr[0];
                } catch (embedErr: any) {
                    logger.error({ err: embedErr, question: qa.question.substring(0,50) }, `[process-pdf PDFJS-DIST] Embedding error for Q&A question.`);
                }

                const firestoreTimestamp = Date.now();
                const qaSourceUrl = `pdf://${originalFilename}`;

                try {
                    await adminDb.collection('training').add({
                        question: qa.question,
                        answer: qa.answer,
                        sourceUrl: qaSourceUrl,
                        embedding: qaEmbedding,
                        timestamp: firestoreTimestamp,
                        userId: userId, // Include userId
                        sourceType: 'pdf-qa'
                    });
                    logger.debug(`[process-pdf PDFJS-DIST] Q&A saved to 'training' collection for: "${qa.question.substring(0,50)}..."`);
                } catch (firestoreErr: any) {
                    logger.error({ err: firestoreErr, question: qa.question.substring(0,50) }, `[process-pdf PDFJS-DIST] Firestore error saving Q&A to 'training'.`);
                }

                try {
                    await adminDb
                        .collection('trainingEmbeddings')
                        .doc(userId)
                        .collection('qas')
                        .add({
                            question: qa.question,
                            answer: qa.answer,
                            sourceUrl: qaSourceUrl,
                            embedding: qaEmbedding, // Storing embedding here for potential direct Firestore vector ops if ever supported/needed
                            timestamp: firestoreTimestamp,
                            sourceType: 'pdf-qa'
                        });
                    logger.debug(`[process-pdf PDFJS-DIST] Q&A saved to 'trainingEmbeddings' for user ${userId} for: "${qa.question.substring(0,50)}..."`);
                } catch (firestoreEmbedErr: any) {
                    logger.error({ err: firestoreEmbedErr, userId, question: qa.question.substring(0,50) }, `[process-pdf PDFJS-DIST] Error saving Q&A to 'trainingEmbeddings'.`);
                }

                // Also upsert Q&A embedding to Pinecone for RAG
                if (qaEmbedding) {
                    try {
                        // Use the already initialized pineconeIndex
                        const qaVector = {
                            id: `qa-${userId}-${firestoreTimestamp}-${qas.indexOf(qa)}`, // Unique ID for QA
                            values: qaEmbedding,
                            metadata: {
                                userId,
                                originalSourceUrl: qaSourceUrl, // URL of the PDF
                                sourceType: 'qa', // Specific type for Q&A items
                                question: qa.question,
                                answer: qa.answer,
                                originalFilename: originalFilename // Keep original filename for context
                            },
                        };
                        await pineconeIndex.upsert([qaVector]);
                        logger.debug(`[process-pdf PDFJS-DIST] Q&A embedding upserted to Pinecone for: "${qa.question.substring(0,50)}..."`);
                    } catch (pineconeError: any) {
                        logger.error({ err: pineconeError, question: qa.question.substring(0,50) }, `[process-pdf PDFJS-DIST] Error upserting Q&A embedding to Pinecone.`);
                    }
                }
            }
            logger.info(`[process-pdf PDFJS-DIST] Finished processing Q&A pairs for ${originalFilename}.`);
        }
    } else {
        logger.info(`[process-pdf PDFJS-DIST] Skipping Q&A extraction as no text was extracted or text is empty for ${originalFilename}.`);
    }
    // --- End Q&A Extraction and Storage ---

    // --- Full pipeline restored (for chunking main content for Pinecone) ---
    logger.info('[process-pdf PDFJS-DIST] Chunking text...');
    // Add an explicit check to ensure 'text' is a string, to satisfy TypeScript's control flow analysis.
    // This should ideally be guaranteed by the `if (!text)` check much earlier.
    if (typeof text !== 'string') { // Should have been caught by earlier `if(!text)` that throws ApiError
        logger.error('[process-pdf PDFJS-DIST] CRITICAL: text variable is not a string before chunking. This should not happen.');
        throw new ApiError(500, 'Internal server error: text processing failed.', false);
    }
    // Assign to a new const with explicit type to further clarify for TypeScript
    const textForChunking: string = text;
    // Use 'textForChunking || ""' to ensure a string is always passed.
    // Add 'as string' assertion as a last resort if TypeScript control flow analysis is still confused.
    // Given previous checks, textForChunking should already be a valid string here.
    const chunks = chunkText((textForChunking || "") as string);
    if (!chunks || chunks.length === 0) {
      logger.warn('[process-pdf PDFJS-DIST] No valid text chunks found after processing (or text was empty) for %s.', originalFilename);
      throw new ApiError(400, 'No valid text chunks found after processing (or text was empty).');
    }
    logger.info(`[process-pdf PDFJS-DIST] Text chunked into ${chunks.length} chunks for %s.`, originalFilename);

    logger.info('[process-pdf PDFJS-DIST] Classifying tags with OpenAI for %s...', originalFilename);
    let tagsArr: string[][] = [];
    const maxChunksForTags = 10; 
    const tagChunksToProcess = chunks.slice(0, maxChunksForTags);
    for (const chunk of tagChunksToProcess) {
        try {
            const tags = await classifyTagsWithOpenAI(chunk);
            tagsArr.push(tags);
        } catch (tagError: any) {
            logger.error({ err: tagError, filename: originalFilename }, "[process-pdf PDFJS-DIST] Error classifying tags for chunk.");
            tagsArr.push(['general', 'pdf-upload']);
        }
    }
    while (tagsArr.length < chunks.length) {
        tagsArr.push(['general', 'pdf-upload']);
    }
    logger.info('[process-pdf PDFJS-DIST] Tags classified for %s.', originalFilename);

    // Pinecone client (pineconeIndex) is already initialized earlier in the function.
    
    logger.info('[process-pdf PDFJS-DIST] Generating embeddings for main text chunks and upserting to Pinecone for %s...', originalFilename);
    const now = Date.now(); // Timestamp for main chunk vectors
    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(chunks);
    } catch (e: any) {
      logger.error({ err: e, filename: originalFilename }, '[process-pdf PDFJS-DIST] Embedding API error.');
      throw new ApiError(502, `Embedding generation failed. ${e.message || ''}`.trim());
    }

    const vectors = chunks.map((chunk, i) => ({
      id: `${userId}-pdf-${now}-${i}`,
      values: embeddings[i],
      metadata: {
        userId,
        documentName: originalFilename,
        originalFilename,
        chunkIndex: i,
        sourceType: 'pdf',
        text: chunk,
        tags: tagsArr[i],
        contentType: fileEntry.type,
      },
    }));

    try {
      await pineconeIndex.upsert(vectors);
      logger.info(`[process-pdf PDFJS-DIST] Successfully upserted ${vectors.length} vectors to Pinecone for %s.`, originalFilename);
    } catch (e: any) {
      logger.error({ err: e, filename: originalFilename }, '[process-pdf PDFJS-DIST] Pinecone upsert error.');
      throw new ApiError(502, `Failed to save data to knowledge base. ${e.message || ''}`.trim());
    }

    logger.info('[process-pdf PDFJS-DIST] Saving metadata to Firestore for %s...', originalFilename);
    const batch = adminDb.batch();
    vectors.forEach((vec) => {
      const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
      batch.set(chunkRef, { ...vec.metadata, createdAt: now });
    });
    await batch.commit();
    logger.info('[process-pdf PDFJS-DIST] Metadata saved to Firestore for %s.', originalFilename);

    await adminDb.collection('pdf_uploads').add({
        userId, originalFilename, chunkCount: chunks.length, uploadedAt: now,
        sourceType: 'pdf', size: fileEntry.size, contentType: fileEntry.type,
    });
    logger.info('[process-pdf PDFJS-DIST] Document-level metadata saved for %s.', originalFilename);

    return NextResponse.json({
      success: true, message: 'PDF file processed and ingested successfully using pdfjs-dist.',
      documentName: originalFilename, chunkCount: chunks.length,
    });

  } catch (error: any) {
    logger.error({ err: error, path: req.nextUrl.pathname, method: req.method }, '[process-pdf PDFJS-DIST] Unhandled error in POST handler');
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
