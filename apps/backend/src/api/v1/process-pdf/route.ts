import { NextRequest, NextResponse } from 'next/server';
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.js'; // Using legacy CommonJS build for Node.js as per user instruction

// Removed worker setup as per user instruction for Node.js legacy build.

import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { adminDb, getAuth } from '@/lib/firebaseAdmin'; // Combined and updated import
import { headers } from 'next/headers';
// import { Readable } from 'stream'; // Likely not needed with pdfjs-dist
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { chunkText } from '@/ingestion/shared/chunkText';
import { generateEmbeddings } from '@/ingestion/shared/embedding';
import { extractQAFromTextWithLLM, QA } from '@/lib/preprocess'; // For Q&A generation

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
    } catch (e) {
      // This catch block might not be hit if the error is in pdf.js's internal require.
      console.error("Error assigning workerSrc string for pdfjs-dist legacy: ", e);
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
  console.log('[process-pdf PDFJS-DIST] POST handler entered');
  try {
    let userId: string;

    // --- DEVELOPMENT ONLY: Firebase Auth Bypass ---
    // TODO: Remove this block and re-enable Firebase Auth before production!
    // This is for testing purposes only to bypass Firebase Auth in development.
    if (process.env.NODE_ENV === 'development') {
      console.log('[process-pdf PDFJS-DIST] DEVELOPMENT MODE: Firebase Auth skipped.');
      userId = 'dev-user-id'; // Using a mock user ID for development
      console.log('[process-pdf PDFJS-DIST] Using mock User ID for development:', userId);
    } else {
      // Production Firebase Auth logic
      console.log('[process-pdf PDFJS-DIST] Verifying Firebase Auth...');
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing or invalid auth token' }, { status: 401 });
      }
      const idToken = authHeader.split(' ')[1];
      let decodedToken;
      try {
        decodedToken = await getAuth().verifyIdToken(idToken);
      } catch (e) {
        console.error('[process-pdf PDFJS-DIST] Firebase Auth token verification failed:', e);
        return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
      }
      if (!decodedToken || !decodedToken.uid) { // Check if decodedToken or uid is null/undefined
        console.error('[process-pdf PDFJS-DIST] Firebase Auth: UID not found in token.');
        return NextResponse.json({ error: 'User not found after auth (UID missing)' }, { status: 401 });
      }
      userId = decodedToken.uid;
      console.log('[process-pdf PDFJS-DIST] Firebase Auth verified. User ID:', userId);
    }
    // --- END DEVELOPMENT ONLY ---

    // Ensure userId is set, otherwise critical operations will fail.
    // This check is more of a safeguard; the logic above should always set userId.
    if (!userId) {
        console.error('[process-pdf PDFJS-DIST] CRITICAL: userId not set after auth block.');
        return NextResponse.json({ error: 'Internal server error: User ID not determined.' }, { status: 500 });
    }

    // --- Initialize Pinecone Client Once ---
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;

    if (!pineconeApiKey || !pineconeIndexName) {
        console.error('[process-pdf PDFJS-DIST] Pinecone API Key or Index not configured.');
        return NextResponse.json({ error: 'Server configuration error for Pinecone.' }, { status: 500 });
    }
    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const pineconeIndex = pinecone.index(pineconeIndexName).namespace(`user-${userId}`);
    // --- End Pinecone Client Initialization ---

    console.log('[process-pdf PDFJS-DIST] Parsing form data using req.formData()...');
    const formData = await req.formData();
    const fileEntry = formData.get('file') as File | null;

    if (!fileEntry || typeof fileEntry === 'string') {
      console.log('[process-pdf PDFJS-DIST] No file found in FormData.');
      return NextResponse.json({ error: 'No PDF file uploaded' }, { status: 400 });
    }
    
    if (fileEntry.type !== 'application/pdf') {
        console.log(`[process-pdf PDFJS-DIST] Invalid file type: ${fileEntry.type}.`);
        return NextResponse.json({ error: `Invalid file type: ${fileEntry.type}. Only PDF files are allowed.` }, { status: 400 });
    }

    const originalFilename = sanitizeFilename(fileEntry.name || `document-${Date.now()}.pdf`);
    console.log('[process-pdf PDFJS-DIST] Form data parsed. Original filename:', originalFilename);

    console.log('[process-pdf PDFJS-DIST] Reading PDF ArrayBuffer from File object...');
    const arrayBuffer = await fileEntry.arrayBuffer(); // Use ArrayBuffer directly for pdfjs-dist

    let text: string;
    try {
      console.log('[process-pdf PDFJS-DIST] Parsing PDF content with pdfjs-dist...');
      text = await extractTextFromPdfWithPdfjs(arrayBuffer);
    } catch (e: any) {
      console.error('[process-pdf PDFJS-DIST] Error parsing PDF with pdfjs-dist:', e.message, e.stack);
      return NextResponse.json({ error: `Failed to parse PDF with pdfjs-dist. ${e.message || ''}`.trim() }, { status: 400 });
    }
    
    if (!text) {
      console.log('[process-pdf PDFJS-DIST] No extractable text found by pdfjs-dist.');
      return NextResponse.json({ error: 'No extractable text found by pdfjs-dist.' }, { status: 400 });
    }
    console.log('[process-pdf PDFJS-DIST] pdfjs-dist successful. Extracted text length:', text.length);

    // --- Q&A Extraction and Storage (similar to fetch-url) ---
    console.log(`[process-pdf PDFJS-DIST] Starting Q&A extraction for ${originalFilename}.`);
    let qas: QA[] = [];
    if (text && text.trim().length > 0) { // Ensure there is text to process
        try {
            qas = await extractQAFromTextWithLLM(text); // Use the full PDF text
            console.log(`[process-pdf PDFJS-DIST] Q&A extraction completed for ${originalFilename}. Found ${qas.length} Q&A pairs.`);
        } catch (err: any) {
            console.error(`[process-pdf PDFJS-DIST] Q&A extraction failed for ${originalFilename}:`, err.message, err.stack);
            // Log error, qas remains empty, proceed with main content ingestion
        }

        if (qas.length > 0) {
            console.log(`[process-pdf PDFJS-DIST] Processing ${qas.length} Q&A pairs for ${originalFilename}.`);
            for (const qa of qas) {
                let qaEmbedding = null;
                try {
                    console.log(`[process-pdf PDFJS-DIST] Generating embedding for Q&A question: "${qa.question.substring(0, 50)}..."`);
                    const embeddingArr = await generateEmbeddings([qa.question]);
                    qaEmbedding = embeddingArr[0];
                } catch (embedErr: any) {
                    console.error(`[process-pdf PDFJS-DIST] Embedding error for Q&A question "${qa.question.substring(0,50)}...":`, embedErr.message);
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
                    console.log(`[process-pdf PDFJS-DIST] Q&A saved to 'training' collection for: "${qa.question.substring(0,50)}..."`);
                } catch (firestoreErr: any) {
                    console.error(`[process-pdf PDFJS-DIST] Firestore error saving Q&A to 'training' for "${qa.question.substring(0,50)}...":`, firestoreErr.message);
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
                    console.log(`[process-pdf PDFJS-DIST] Q&A saved to 'trainingEmbeddings' for user ${userId} for: "${qa.question.substring(0,50)}..."`);
                } catch (firestoreEmbedErr: any) {
                    console.error(`[process-pdf PDFJS-DIST] Error saving Q&A to 'trainingEmbeddings' for user ${userId} for "${qa.question.substring(0,50)}...":`, firestoreEmbedErr.message);
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
                        console.log(`[process-pdf PDFJS-DIST] Q&A embedding upserted to Pinecone for: "${qa.question.substring(0,50)}..."`);
                    } catch (pineconeError: any) {
                        console.error(`[process-pdf PDFJS-DIST] Error upserting Q&A embedding to Pinecone for "${qa.question.substring(0,50)}...":`, pineconeError.message);
                    }
                }
            }
            console.log(`[process-pdf PDFJS-DIST] Finished processing Q&A pairs for ${originalFilename}.`);
        }
    } else {
        console.log(`[process-pdf PDFJS-DIST] Skipping Q&A extraction as no text was extracted or text is empty for ${originalFilename}.`);
    }
    // --- End Q&A Extraction and Storage ---

    // --- Full pipeline restored (for chunking main content for Pinecone) ---
    console.log('[process-pdf PDFJS-DIST] Chunking text...');
    // Add an explicit check to ensure 'text' is a string, to satisfy TypeScript's control flow analysis.
    // This should ideally be guaranteed by the `if (!text)` check much earlier.
    if (typeof text !== 'string') {
        console.error('[process-pdf PDFJS-DIST] CRITICAL: text variable is not a string before chunking. This should not happen.');
        return NextResponse.json({ error: 'Internal server error: text processing failed.' }, { status: 500 });
    }
    // Assign to a new const with explicit type to further clarify for TypeScript
    const textForChunking: string = text;
    // Use 'textForChunking || ""' to ensure a string is always passed.
    // Add 'as string' assertion as a last resort if TypeScript control flow analysis is still confused.
    // Given previous checks, textForChunking should already be a valid string here.
    const chunks = chunkText((textForChunking || "") as string);
    if (!chunks || chunks.length === 0) {
      console.log('[process-pdf PDFJS-DIST] No valid text chunks found after processing (or text was empty).');
      return NextResponse.json({ error: 'No valid text chunks found after processing (or text was empty).' }, { status: 400 });
    }
    console.log(`[process-pdf PDFJS-DIST] Text chunked into ${chunks.length} chunks.`);

    console.log('[process-pdf PDFJS-DIST] Classifying tags with OpenAI...');
    let tagsArr: string[][] = [];
    const maxChunksForTags = 10; 
    const tagChunksToProcess = chunks.slice(0, maxChunksForTags);
    for (const chunk of tagChunksToProcess) {
        try {
            const tags = await classifyTagsWithOpenAI(chunk);
            tagsArr.push(tags);
        } catch (tagError: any) {
            console.error("[process-pdf PDFJS-DIST] Error classifying tags for chunk:", tagError.message);
            tagsArr.push(['general', 'pdf-upload']);
        }
    }
    while (tagsArr.length < chunks.length) {
        tagsArr.push(['general', 'pdf-upload']);
    }
    console.log('[process-pdf PDFJS-DIST] Tags classified.');

    // Pinecone client (pineconeIndex) is already initialized earlier in the function.
    
    console.log('[process-pdf PDFJS-DIST] Generating embeddings for main text chunks and upserting to Pinecone...');
    const now = Date.now(); // Timestamp for main chunk vectors
    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(chunks);
    } catch (e: any) {
      console.error('[process-pdf PDFJS-DIST] Embedding API error:', e.message);
      return NextResponse.json({ error: `Embedding generation failed. ${e.message || ''}`.trim() }, { status: 502 });
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
      console.log(`[process-pdf PDFJS-DIST] Successfully upserted ${vectors.length} vectors to Pinecone.`);
    } catch (e: any) {
      console.error('[process-pdf PDFJS-DIST] Pinecone upsert error:', e.message);
      return NextResponse.json({ error: `Failed to save data to knowledge base. ${e.message || ''}`.trim() }, { status: 502 });
    }

    console.log('[process-pdf PDFJS-DIST] Saving metadata to Firestore...');
    const batch = adminDb.batch();
    vectors.forEach((vec) => {
      const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
      batch.set(chunkRef, { ...vec.metadata, createdAt: now });
    });
    await batch.commit();
    console.log('[process-pdf PDFJS-DIST] Metadata saved to Firestore.');

    await adminDb.collection('pdf_uploads').add({
        userId, originalFilename, chunkCount: chunks.length, uploadedAt: now,
        sourceType: 'pdf', size: fileEntry.size, contentType: fileEntry.type,
    });
    console.log('[process-pdf PDFJS-DIST] Document-level metadata saved.');

    return NextResponse.json({
      success: true, message: 'PDF file processed and ingested successfully using pdfjs-dist.',
      documentName: originalFilename, chunkCount: chunks.length,
    });

  } catch (error: any) {
    console.error('[process-pdf PDFJS-DIST] Unhandled error in POST handler:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
