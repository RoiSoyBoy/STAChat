import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.js';

import { OpenAI } from 'openai'; // Keep for classifyTagsWithOpenAI if it uses it directly
import { Pinecone } from '@pinecone-database/pinecone';
import { adminDb, getAuth } from '../../../lib/firebaseAdmin'; // Adjusted path
import { classifyTagsWithOpenAI } from '../../../lib/ingestion/classifyTagsWithOpenAI'; // Adjusted path
// import { chunkText } from '../../../lib/chunkText'; // Adjusted path - FILE MISSING
import { generateEmbeddings } from '../../../lib/embedding'; // Adjusted path
import { extractQAFromTextWithLLM, QA } from '../../../lib/preprocess'; // Adjusted path
import logger, { sanitizeError } from '../../../lib/logger'; // Adjusted path
import { ApiError } from '../../../middleware/errorHandler'; // Adjusted path
import { AuthenticatedRequest, verifyTokenMiddleware } from '../../../middleware/auth.middleware'; // For JWT auth

const router = Router();
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory

// pdfjs-dist worker setup for Node.js
if (typeof window === 'undefined') {
  const lib = pdfjsNamespace; // Removed .default access
  if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
    try {
      lib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
      logger.info('[process-pdf Express] pdfjs-dist workerSrc configured for Node.js legacy build.');
    } catch (e: any) {
      logger.error({ err: e }, "[process-pdf Express] Error assigning workerSrc string for pdfjs-dist legacy");
    }
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function extractTextFromPdfWithPdfjs(buffer: ArrayBuffer): Promise<string> {
  const lib = pdfjsNamespace; // Removed .default access
  const loadingTask = lib.getDocument({ data: buffer });
  const pdfDocument = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

// Apply JWT middleware if you want to protect this route with your existing JWT auth
// If using Firebase Auth primarily, you might adapt the Firebase auth logic below.
// For now, let's assume JWT auth is primary for Express routes.
// router.use(verifyTokenMiddleware); // Uncomment if JWT auth is needed for this route

router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  const expressReq = req as AuthenticatedRequest; // Cast to AuthenticatedRequest if using verifyTokenMiddleware
  logger.info('[process-pdf Express] POST handler entered');
  try {
    let userId: string;

    // --- Firebase Auth Logic (adapted for Express) ---
    // If using verifyTokenMiddleware, req.user should be populated.
    // If using Firebase ID tokens directly:
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_FIREBASE_AUTH === 'true') {
      logger.info('[process-pdf Express] DEVELOPMENT MODE: Firebase Auth skipped via ENV.');
      userId = process.env.DEV_USER_ID || 'dev-user-id-express'; 
      logger.info('[process-pdf Express] Using mock User ID for development: %s', userId);
    } else if (expressReq.user && expressReq.user.id) { // Check if JWT middleware populated user
        logger.info('[process-pdf Express] JWT Auth verified. User ID from JWT: %s', expressReq.user.id);
        userId = expressReq.user.id;
    } else {
      logger.info('[process-pdf Express] Verifying Firebase Auth via Authorization header...');
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[process-pdf Express] Missing or invalid auth token for Firebase.');
        return next(new ApiError(401, 'Missing or invalid authorization token for Firebase.'));
      }
      const idToken = authHeader.split(' ')[1];
      let decodedToken;
      try {
        decodedToken = await getAuth().verifyIdToken(idToken);
      } catch (e: any) {
        logger.error({ err: e }, '[process-pdf Express] Firebase Auth token verification failed.');
        return next(new ApiError(401, `Invalid or expired Firebase auth token: ${e.message}`));
      }
      if (!decodedToken || !decodedToken.uid) {
        logger.error('[process-pdf Express] Firebase Auth: UID not found in token.');
        return next(new ApiError(401, 'User not found after Firebase auth (UID missing).'));
      }
      userId = decodedToken.uid;
      logger.info('[process-pdf Express] Firebase Auth verified. User ID: %s', userId);
    }
    // --- End Firebase Auth Logic ---

    if (!userId) {
        logger.error('[process-pdf Express] CRITICAL: userId not set after auth block.');
        return next(new ApiError(500, 'Internal server error: User ID not determined.', false));
    }

    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX_NAME; // Corrected env var name from .env

    if (!pineconeApiKey || !pineconeIndexName) {
        logger.error('[process-pdf Express] CRITICAL: Pinecone API Key or Index not configured.');
        return next(new ApiError(500, 'CRITICAL: Server configuration error (Pinecone).', false));
    }
    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const pineconeIndex = pinecone.index(pineconeIndexName).namespace(`user-${userId}`);

    if (!req.file) {
      logger.warn('[process-pdf Express] No file found in request (multer).');
      return next(new ApiError(400, 'No PDF file uploaded.'));
    }

    const file = req.file;
    if (file.mimetype !== 'application/pdf') {
        logger.warn(`[process-pdf Express] Invalid file type: ${file.mimetype}.`);
        return next(new ApiError(400, `Invalid file type: ${file.mimetype}. Only PDF files are allowed.`));
    }

    const originalFilename = sanitizeFilename(file.originalname || `document-${Date.now()}.pdf`);
    logger.info('[process-pdf Express] File received. Original filename: %s', originalFilename);

    const arrayBuffer = file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength);

    let text: string;
    try {
      logger.info('[process-pdf Express] Parsing PDF content with pdfjs-dist...');
      text = await extractTextFromPdfWithPdfjs(arrayBuffer);
    } catch (e: any) {
      logger.error({ err: e, filename: originalFilename }, '[process-pdf Express] Error parsing PDF with pdfjs-dist.');
      return next(new ApiError(400, `Failed to parse PDF with pdfjs-dist. ${e.message || ''}`.trim()));
    }
    
    if (!text) {
      logger.warn('[process-pdf Express] No extractable text found by pdfjs-dist for %s.', originalFilename);
      return next(new ApiError(400, 'No extractable text found in PDF.'));
    }
    logger.info('[process-pdf Express] pdfjs-dist successful. Extracted text length: %d for %s.', text.length, originalFilename);

    logger.info(`[process-pdf Express] Starting Q&A extraction for ${originalFilename}.`);
    let qas: QA[] = [];
    if (text && text.trim().length > 0) {
        try {
            qas = await extractQAFromTextWithLLM(text);
            logger.info(`[process-pdf Express] Q&A extraction completed for ${originalFilename}. Found ${qas.length} Q&A pairs.`);
        } catch (err: any) {
            logger.error({ err, filename: originalFilename }, `[process-pdf Express] Q&A extraction failed.`);
        }

        if (qas.length > 0) {
            logger.info(`[process-pdf Express] Processing ${qas.length} Q&A pairs for ${originalFilename}.`);
            for (const qa of qas) {
                let qaEmbedding = null;
                try {
                    const embeddingArr = await generateEmbeddings([qa.question]);
                    qaEmbedding = embeddingArr[0];
                } catch (embedErr: any) {
                    logger.error({ err: embedErr, question: qa.question.substring(0,50) }, `[process-pdf Express] Embedding error for Q&A question.`);
                }

                const firestoreTimestamp = Date.now();
                const qaSourceUrl = `pdf://${originalFilename}`;

                try {
                    await adminDb.collection('training').add({
                        question: qa.question, answer: qa.answer, sourceUrl: qaSourceUrl,
                        embedding: qaEmbedding, timestamp: firestoreTimestamp, userId: userId, sourceType: 'pdf-qa'
                    });
                } catch (firestoreErr: any) {
                    logger.error({ err: firestoreErr, question: qa.question.substring(0,50) }, `[process-pdf Express] Firestore error saving Q&A to 'training'.`);
                }

                try {
                    await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').add({
                        question: qa.question, answer: qa.answer, sourceUrl: qaSourceUrl,
                        embedding: qaEmbedding, timestamp: firestoreTimestamp, sourceType: 'pdf-qa'
                    });
                } catch (firestoreEmbedErr: any) {
                    logger.error({ err: firestoreEmbedErr, userId, question: qa.question.substring(0,50) }, `[process-pdf Express] Error saving Q&A to 'trainingEmbeddings'.`);
                }

                if (qaEmbedding) {
                    try {
                        const qaVector = {
                            id: `qa-${userId}-${firestoreTimestamp}-${qas.indexOf(qa)}`,
                            values: qaEmbedding,
                            metadata: { userId, originalSourceUrl: qaSourceUrl, sourceType: 'qa', question: qa.question, answer: qa.answer, originalFilename },
                        };
                        await pineconeIndex.upsert([qaVector]);
                    } catch (pineconeError: any) {
                        logger.error({ err: pineconeError, question: qa.question.substring(0,50) }, `[process-pdf Express] Error upserting Q&A embedding to Pinecone.`);
                    }
                }
            }
        }
    } else {
        logger.info(`[process-pdf Express] Skipping Q&A extraction as no text was extracted for ${originalFilename}.`);
    }

    // logger.info('[process-pdf Express] Chunking text...');
    // const textForChunking: string = text;
    // const chunks = chunkText((textForChunking || "") as string); // FILE MISSING: chunkText
    // if (!chunks || chunks.length === 0) {
    //   logger.warn('[process-pdf Express] No valid text chunks found for %s.', originalFilename);
    //   return next(new ApiError(400, 'No valid text chunks found after processing.'));
    // }
    // logger.info(`[process-pdf Express] Text chunked into ${chunks.length} chunks for %s.`, originalFilename);

    // logger.info('[process-pdf Express] Classifying tags with OpenAI for %s...', originalFilename);
    // let tagsArr: string[][] = [];
    // const maxChunksForTags = 10; 
    // const tagChunksToProcess = chunks.slice(0, maxChunksForTags);
    // for (const chunk of tagChunksToProcess) {
    //     try {
    //         const tags = await classifyTagsWithOpenAI(chunk);
    //         tagsArr.push(tags);
    //     } catch (tagError: any) {
    //         logger.error({ err: tagError, filename: originalFilename }, "[process-pdf Express] Error classifying tags for chunk.");
    //         tagsArr.push(['general', 'pdf-upload']);
    //     }
    // }
    // while (tagsArr.length < chunks.length) {
    //     tagsArr.push(['general', 'pdf-upload']);
    // }

    // logger.info('[process-pdf Express] Generating embeddings and upserting to Pinecone for %s...', originalFilename);
    // const now = Date.now();
    // let embeddings: number[][];
    // try {
    //   embeddings = await generateEmbeddings(chunks);
    // } catch (e: any) {
    //   logger.error({ err: e, filename: originalFilename }, '[process-pdf Express] Embedding API error.');
    //   return next(new ApiError(502, `Embedding generation failed. ${e.message || ''}`.trim()));
    // }

    // const vectors = chunks.map((chunk: string, i: number) => ({ // Added types for chunk and i
    //   id: `${userId}-pdf-${now}-${i}`,
    //   values: embeddings[i],
    //   metadata: { userId, documentName: originalFilename, originalFilename, chunkIndex: i, sourceType: 'pdf', text: chunk, tags: tagsArr[i], contentType: file.mimetype },
    // }));

    // try {
    //   await pineconeIndex.upsert(vectors);
    // } catch (e: any) {
    //   logger.error({ err: e, filename: originalFilename }, '[process-pdf Express] Pinecone upsert error.');
    //   return next(new ApiError(502, `Failed to save data to knowledge base. ${e.message || ''}`.trim()));
    // }

    // logger.info('[process-pdf Express] Saving metadata to Firestore for %s...', originalFilename);
    // const batch = adminDb.batch();
    // vectors.forEach((vec: { id: string; metadata: any; }) => { // Added type for vec
    //   const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
    //   batch.set(chunkRef, { ...vec.metadata, createdAt: now });
    // });
    // await batch.commit();

    // await adminDb.collection('pdf_uploads').add({
    //     userId, originalFilename, chunkCount: chunks.length, uploadedAt: now,
    //     sourceType: 'pdf', size: file.size, contentType: file.mimetype,
    // });

    // res.status(200).json({
    //   success: true, message: 'PDF file processed and ingested successfully using Express (chunking disabled due to missing file).',
    //   documentName: originalFilename, 
    //   // chunkCount: chunks.length, // chunking disabled
    // });
    logger.warn('[process-pdf Express] Text chunking, embedding, and Pinecone upsert logic has been temporarily disabled due to missing chunkText.ts.');
    res.status(200).json({
        success: true,
        message: 'PDF text extracted, Q&A processed. Main content chunking/vectorization disabled due to missing chunkText.ts.',
        documentName: originalFilename,
        textLength: text.length,
        qnaPairCount: qas.length,
        status: "PARTIAL_SUCCESS_CHUNKTEXT_MISSING"
    });

  } catch (error: any) {
    logger.error({ err: error, path: req.path, method: req.method }, '[process-pdf Express] Unhandled error in POST handler');
    // Pass to global error handler
    next(error);
  }
});

export default router;
