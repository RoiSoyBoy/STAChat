import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.js';

import { OpenAI } from 'openai'; // Keep for classifyTagsWithOpenAI if it uses it directly
import { Pinecone } from '@pinecone-database/pinecone';
import { adminDb, getAuth } from '../../../lib/firebaseAdmin'; // Adjusted path
import { classifyTagsWithOpenAI } from '../../../lib/ingestion/classifyTagsWithOpenAI'; // Adjusted path
import { chunkText } from 'shared'; // Use chunkText from shared package
import { generateEmbeddings } from '../../../lib/embedding'; // Adjusted path
import { extractQAFromTextWithLLM } from '../../../../../../packages/preprocessing/preprocess'; // Explicit relative path
import { QA } from '../../../../../../packages/preprocessing/types'; // Import QA from types.ts
import logger, { sanitizeError } from '../../../lib/logger'; // Adjusted path
import { ApiError } from '../../../middleware/errorHandler'; // Adjusted path
import { AuthenticatedRequest, verifyTokenMiddleware } from '../../../middleware/auth.middleware'; // For JWT auth

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});

// Singleton pattern for pdfjs-dist worker setup
let isWorkerConfigured = false;

function configurePdfWorker() {
  if (isWorkerConfigured) return;
  
  if (typeof window === 'undefined') {
    const lib = pdfjsNamespace;
    if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
      try {
        lib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
        logger.info('[process-pdf Express] pdfjs-dist workerSrc configured for Node.js legacy build.');
        isWorkerConfigured = true;
      } catch (e: any) {
        logger.error({ err: e }, "[process-pdf Express] Error assigning workerSrc string for pdfjs-dist legacy");
      }
    }
  }
}

// Configure worker once
configurePdfWorker();

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function extractTextFromPdfWithPdfjs(buffer: ArrayBuffer): Promise<string> {
  const lib = pdfjsNamespace;
  
  try {
    const loadingTask = lib.getDocument({ 
      data: buffer,
      useSystemFonts: true,
      disableFontFace: true
    });
    
    const pdfDocument = await loadingTask.promise;
    let fullText = '';
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .trim();
        
        if (pageText) {
          fullText += pageText + '\n';
        }
      } catch (pageError: any) {
        logger.warn({ err: pageError, pageNum: i }, '[process-pdf Express] Error extracting text from page');
        continue; // Skip this page but continue with others
      }
    }
    
    return fullText.trim();
  } catch (error: any) {
    logger.error({ err: error }, '[process-pdf Express] Error in PDF text extraction');
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

// Error handling middleware for multer
function handleMulterError(error: any, req: Request, res: Response, next: NextFunction) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, 'File too large. Maximum size is 10MB.'));
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return next(new ApiError(400, 'Too many files. Only one file allowed.'));
    }
    return next(new ApiError(400, `Upload error: ${error.message}`));
  }
  next(error);
}

router.post('/', 
  upload.single('file'), 
  handleMulterError,
  async (req: Request, res: Response, next: NextFunction) => {
    const expressReq = req as AuthenticatedRequest;
    const requestTimestamp = Date.now();
    logger.info({ timestamp: requestTimestamp, method: req.method, path: req.path, ip: req.ip }, '[process-pdf Express] === REQUEST RECEIVED ===');
    
    try {
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Attempting to determine User ID...');
      let userId: string;

      // --- Enhanced Auth Logic ---
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_FIREBASE_AUTH === 'true') {
        logger.info('[process-pdf Express] DEVELOPMENT MODE: Firebase Auth skipped via ENV.');
        userId = process.env.DEV_USER_ID || 'default-dev-user';
        logger.info('[process-pdf Express] Using mock User ID for development: %s', userId);
      } else if (expressReq.user && expressReq.user.id) {
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

      if (!userId) {
        logger.error({ timestamp: requestTimestamp }, '[process-pdf Express] CRITICAL: userId not set after auth block.');
        return next(new ApiError(500, 'Internal server error: User ID not determined.', false));
      }
      logger.info({ timestamp: requestTimestamp, userId }, '[process-pdf Express] User ID determined.');

      // --- Validate Environment Variables ---
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Validating environment variables...');
      const pineconeApiKey = process.env.PINECONE_API_KEY;
      const pineconeIndexName = process.env.PINECONE_INDEX_NAME;

      if (!pineconeApiKey || !pineconeIndexName) {
        logger.error({ timestamp: requestTimestamp }, '[process-pdf Express] CRITICAL: Pinecone API Key or Index Name not configured in .env.');
        return next(new ApiError(500, 'CRITICAL: Server configuration error (Pinecone).', false));
      }
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Environment variables validated.');

      // --- File Validation ---
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Validating file...');
      if (!req.file) {
        logger.warn({ timestamp: requestTimestamp }, '[process-pdf Express] No file found in request (multer).');
        return next(new ApiError(400, 'No PDF file uploaded.'));
      }

      const file = req.file;
      logger.info({ timestamp: requestTimestamp, fileDetails: { originalname: file.originalname, mimetype: file.mimetype, size: file.size } }, '[process-pdf Express] File details from multer.');

      if (file.mimetype !== 'application/pdf') {
        logger.warn({ timestamp: requestTimestamp, mimetype: file.mimetype }, `[process-pdf Express] Invalid file type.`);
        return next(new ApiError(400, `Invalid file type: ${file.mimetype}. Only PDF files are allowed.`));
      }

      if (file.size === 0) {
        logger.warn({ timestamp: requestTimestamp, filename: file.originalname }, '[process-pdf Express] Empty file uploaded.');
        return next(new ApiError(400, 'Uploaded file is empty.'));
      }

      const originalFilename = sanitizeFilename(file.originalname || `document-${Date.now()}.pdf`);
      logger.info({ timestamp: requestTimestamp, originalFilename, fileSize: file.size }, '[process-pdf Express] File validated and received.');

      // --- Initialize Pinecone ---
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Initializing Pinecone...');
      const pinecone = new Pinecone({ apiKey: pineconeApiKey });
      const targetNamespace = `user-${userId}`;
      logger.info({ timestamp: requestTimestamp, targetNamespace }, `[process-pdf Express] Pinecone Target Namespace determined.`);
      const pineconeIndex = pinecone.index(pineconeIndexName).namespace(targetNamespace);
      logger.info({ timestamp: requestTimestamp }, '[process-pdf Express] Pinecone initialized.');

      // --- PDF Text Extraction ---
      logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Preparing for PDF text extraction...');
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset, 
        file.buffer.byteOffset + file.buffer.byteLength
      );

      let text: string;
      try {
        logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Parsing PDF content with pdfjs-dist...');
        text = await extractTextFromPdfWithPdfjs(arrayBuffer);
      } catch (e: any) {
        logger.error({ timestamp: requestTimestamp, err: sanitizeError(e), filename: originalFilename }, '[process-pdf Express] Error parsing PDF with pdfjs-dist.');
        return next(new ApiError(400, `Failed to parse PDF. The file may be corrupted or password-protected. ${e.message || ''}`.trim()));
      }

      if (!text || text.trim().length === 0) {
        logger.warn({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] No extractable text found by pdfjs-dist.');
        return next(new ApiError(400, 'No extractable text found in PDF. The file may contain only images or be corrupted.'));
      }
      
      logger.info({ timestamp: requestTimestamp, filename: originalFilename, textLength: text.length }, '[process-pdf Express] pdfjs-dist successful. Extracted text.');

      // --- DIAGNOSTIC LOG FOR ENCODING ---
      logger.info({ timestamp: requestTimestamp, filename: originalFilename, extractedTextPreview: text.substring(0, 500) }, '[process-pdf Express] DIAGNOSTIC: Preview of extracted text before Q&A.');

      // --- Q&A Extraction ---
      logger.info({ timestamp: requestTimestamp, filename: originalFilename }, `[process-pdf Express] Starting Q&A extraction...`);
      let qas: QA[] = [];
      
      try {
        qas = await extractQAFromTextWithLLM(text);
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaCount: qas.length }, `[process-pdf Express] Q&A extraction completed.`);
      } catch (err: any) {
        logger.error({ timestamp: requestTimestamp, err: sanitizeError(err), filename: originalFilename }, `[process-pdf Express] Q&A extraction failed.`);
        // Continue processing even if Q&A extraction fails
      }

      // Process Q&A pairs if any were found
      if (qas.length > 0) {
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaCount: qas.length }, `[process-pdf Express] Processing Q&A pairs...`);
        
        for (const [qaIndex, qa] of qas.entries()) {
          logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex, questionPreview: qa.question.substring(0,50) }, `[process-pdf Express] Processing Q&A pair ${qaIndex + 1}/${qas.length}.`);
          let qaEmbedding = null;
          
          try {
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex }, `[process-pdf Express] Generating embedding for Q&A question...`);
            const embeddingArr = await generateEmbeddings([qa.question]);
            qaEmbedding = embeddingArr[0];
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex }, `[process-pdf Express] Embedding generated for Q&A question.`);
          } catch (embedErr: any) {
            logger.error({ timestamp: requestTimestamp, err: sanitizeError(embedErr), filename: originalFilename, qaIndex, question: qa.question.substring(0,50) }, `[process-pdf Express] Embedding error for Q&A question.`);
            continue; // Skip this Q&A pair
          }

          const firestoreTimestamp = Date.now();
          const qaSourceUrl = `pdf://${originalFilename}`;

          // Save to main training collection
          try {
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex }, `[process-pdf Express] Saving Q&A to 'training' collection in Firestore...`);
            await adminDb.collection('training').add({
              question: qa.question, 
              answer: qa.answer, 
              sourceUrl: qaSourceUrl,
              embedding: qaEmbedding, 
              timestamp: firestoreTimestamp, 
              userId: userId, 
              sourceType: 'pdf-qa'
            });
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex }, `[process-pdf Express] Q&A saved to 'training' collection.`);
          } catch (firestoreErr: any) {
            logger.error({ timestamp: requestTimestamp, err: sanitizeError(firestoreErr), filename: originalFilename, qaIndex, question: qa.question.substring(0,50) }, `[process-pdf Express] Firestore error saving Q&A to 'training'.`);
          }

          // Save to user-specific training embeddings
          try {
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex, userId }, `[process-pdf Express] Saving Q&A to 'trainingEmbeddings' for user...`);
            await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').add({
              question: qa.question, 
              answer: qa.answer, 
              sourceUrl: qaSourceUrl,
              embedding: qaEmbedding, 
              timestamp: firestoreTimestamp, 
              sourceType: 'pdf-qa'
            });
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex, userId }, `[process-pdf Express] Q&A saved to 'trainingEmbeddings'.`);
          } catch (firestoreEmbedErr: any) {
            logger.error({ timestamp: requestTimestamp, err: sanitizeError(firestoreEmbedErr), userId, filename: originalFilename, qaIndex, question: qa.question.substring(0,50) }, `[process-pdf Express] Error saving Q&A to 'trainingEmbeddings'.`);
          }

          // Upsert to Pinecone
          if (qaEmbedding) {
            const qaVector = {
              id: `qa-${userId}-${firestoreTimestamp}-${qaIndex}`,
              values: qaEmbedding,
              metadata: { 
                userId, 
                originalSourceUrl: qaSourceUrl, 
                sourceType: 'qa', 
                question: qa.question, 
                answer: qa.answer, 
                originalFilename 
              },
            };
            
            try {
              logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex, vectorId: qaVector.id, namespace: targetNamespace }, `[process-pdf Express] Upserting Q&A vector to Pinecone...`);
              await pineconeIndex.upsert([qaVector]);
              logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaIndex, vectorId: qaVector.id }, `[process-pdf Express] Successfully upserted Q&A vector to Pinecone.`);
            } catch (pineconeError: any) {
              logger.error({ timestamp: requestTimestamp, err: sanitizeError(pineconeError), filename: originalFilename, qaIndex, question: qa.question.substring(0,50), namespace: targetNamespace }, `[process-pdf Express] Error upserting Q&A embedding to Pinecone.`);
              // Don't fail the entire upload for individual Q&A errors
              continue;
            }
          }
        }
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, qaCount: qas.length }, `[process-pdf Express] Finished processing Q&A pairs.`);
      }

      // --- Text Chunking and Main Content Processing ---
      logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Chunking text...');
      const chunks = chunkText(text);
      
      if (!chunks || chunks.length === 0) {
        logger.warn({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] No valid text chunks found after chunkText.');
        // Continue with just Q&A processing if chunks fail
      } else {
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, chunkCount: chunks.length }, `[process-pdf Express] Text chunked.`);

        // --- Tag Classification ---
        logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Classifying tags with OpenAI...');
        let tagsArr: string[][] = [];
        const maxChunksForTags = 10;
        const tagChunksToProcess = chunks.slice(0, maxChunksForTags);
        
        for (const [chunkIndex, chunk] of tagChunksToProcess.entries()) {
          try {
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, chunkIndex, totalTagChunks: tagChunksToProcess.length }, `[process-pdf Express] Classifying tags for chunk ${chunkIndex + 1}/${tagChunksToProcess.length}...`);
            const tags = await classifyTagsWithOpenAI(chunk);
            tagsArr.push(tags);
            logger.info({ timestamp: requestTimestamp, filename: originalFilename, chunkIndex, tags }, `[process-pdf Express] Tags classified for chunk.`);
          } catch (tagError: any) {
            logger.error({ timestamp: requestTimestamp, err: sanitizeError(tagError), filename: originalFilename, chunkIndex }, "[process-pdf Express] Error classifying tags for chunk.");
            tagsArr.push(['general', 'pdf-upload']); // Default tags on error
          }
        }
        
        // Fill remaining tags if chunks > maxChunksForTags
        while (tagsArr.length < chunks.length) {
          tagsArr.push(['general', 'pdf-upload']);
        }
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, totalTagsGenerated: tagsArr.length }, '[process-pdf Express] Tag classification finished.');

        // --- Generate Embeddings and Upsert ---
        const now = Date.now(); // Consistent timestamp for this batch
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, batchTimestamp: now }, '[process-pdf Express] Generating embeddings for main content chunks...');
        let embeddings: number[][];
        
        try {
          embeddings = await generateEmbeddings(chunks);
          logger.info({ timestamp: requestTimestamp, filename: originalFilename, embeddingsCount: embeddings.length }, '[process-pdf Express] Main content embeddings generated.');
        } catch (e: any) {
          logger.error({ timestamp: requestTimestamp, err: sanitizeError(e), filename: originalFilename }, '[process-pdf Express] Embedding API error for main chunks.');
          return next(new ApiError(502, `Embedding generation failed for main content. ${e.message || ''}`.trim()));
        }

        const vectors = chunks.map((chunk: string, i: number) => ({
          id: `${userId}-pdf-${now}-${i}`, // Use consistent 'now'
          values: embeddings[i],
          metadata: { 
            userId, 
            documentName: originalFilename, 
            originalFilename, 
            chunkIndex: i, 
            sourceType: 'pdf', 
            text: chunk, 
            tags: tagsArr[i], 
            contentType: file.mimetype 
          },
        }));

        logger.info({ timestamp: requestTimestamp, filename: originalFilename, vectorCount: vectors.length, namespace: targetNamespace }, `[process-pdf Express] Preparing to upsert main content vectors to Pinecone...`);
        
        try {
          await pineconeIndex.upsert(vectors);
          logger.info({ timestamp: requestTimestamp, filename: originalFilename, vectorCount: vectors.length, namespace: targetNamespace }, `[process-pdf Express] Successfully upserted main content vectors to Pinecone.`);
          
          try {
            const stats = await pineconeIndex.describeIndexStats();
            logger.info({ timestamp: requestTimestamp, namespace: targetNamespace, stats: stats.namespaces?.[targetNamespace] }, `[process-pdf Express] Pinecone namespace stats after main content upsert.`);
          } catch (statsError: any) {
            logger.warn({ timestamp: requestTimestamp, err: sanitizeError(statsError), namespace: targetNamespace}, `[process-pdf Express] Could not fetch Pinecone stats after upsert.`);
          }
        } catch (e: any) {
          logger.error({ timestamp: requestTimestamp, err: sanitizeError(e), filename: originalFilename, namespace: targetNamespace }, '[process-pdf Express] Pinecone upsert error for main chunks.');
          return next(new ApiError(502, `Failed to save main content data to knowledge base. ${e.message || ''}`.trim()));
        }

        // --- Save to Firestore ---
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, vectorCount: vectors.length }, '[process-pdf Express] Saving main chunk metadata to Firestore...');
        const batch = adminDb.batch();
        
        vectors.forEach((vec: { id: string; metadata: any; }) => {
          const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
          batch.set(chunkRef, { ...vec.metadata, createdAt: now }); // Use consistent 'now'
        });
        
        await batch.commit();
        logger.info({ timestamp: requestTimestamp, filename: originalFilename, batchSize: vectors.length }, '[process-pdf Express] Main chunk metadata saved to Firestore.');

        // --- Document Metadata ---
        logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Saving document-level metadata to Firestore...');
        await adminDb.collection('pdf_uploads').add({
          userId, 
          originalFilename, 
          chunkCount: chunks.length, 
          uploadedAt: now, // Use consistent 'now'
          sourceType: 'pdf', 
          size: file.size, 
          contentType: file.mimetype,
        });
        logger.info({ timestamp: requestTimestamp, filename: originalFilename }, '[process-pdf Express] Document-level metadata saved.');
      }

      // --- Success Response ---
      const responseData = {
        success: true, 
        message: 'PDF file processed and ingested successfully.',
        documentName: originalFilename,
        qnaPairCount: qas.length,
        chunkCount: chunks ? chunks.length : 0,
        status: chunks && chunks.length > 0 ? "SUCCESS" : "PARTIAL_SUCCESS_NO_CHUNKS_GENERATED"
      };

      logger.info({ timestamp: requestTimestamp, filename: originalFilename, responseData }, '[process-pdf Express] === REQUEST COMPLETED SUCCESSFULLY ===');
      res.status(200).json(responseData);

    } catch (error: any) {
      const sanitizedErr = sanitizeError(error);
      logger.error({ timestamp: requestTimestamp, err: sanitizedErr, path: req.path, method: req.method, userId: (req as AuthenticatedRequest).user?.id }, '[process-pdf Express] === UNHANDLED ERROR IN POST HANDLER ===');
      next(error); // Pass original error to error handler middleware
    }
  }
);

export default router;
