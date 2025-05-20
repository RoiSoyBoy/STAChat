import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getStorage } from '@/lib/firebaseAdmin'; // Updated getStorage import
import { headers } from 'next/headers';
import { checkRateLimit, getRateLimitResponse } from '@/lib/cache';
import { firebaseAuthMiddleware, getUserIdFromRequest } from '@/lib/firebaseAuthMiddleware';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { chunkText } from '@/ingestion/shared/chunkText';
import { generateEmbeddings } from '@/ingestion/shared/embedding';
import { extractQAFromTextWithLLM, QA } from '@/lib/preprocess'; // For Q&A generation

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper: Sanitize filename
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Constants for MIME types
const MIME_TYPE_JPEG = 'image/jpeg';
const MIME_TYPE_PNG = 'image/png';
const MIME_TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_TYPE_TXT = 'text/plain';
const MIME_TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_TYPE_XLS = 'application/vnd.ms-excel';

export async function POST(request: NextRequest) {
  let userId: string | null;

  // --- DEVELOPMENT ONLY: Firebase Auth Bypass ---
  // TODO: Remove this block and implement proper token sending from client for production!
  if (process.env.NODE_ENV === 'development') {
    console.log('[API /upload] DEVELOPMENT MODE: Firebase Auth skipped.');
    userId = 'dev-user-id'; // Using a mock user ID for development
    // Ensure the request object has userId for downstream use if middleware normally adds it
    (request as any).userId = userId; 
    console.log('[API /upload] Using mock User ID for development:', userId);
  } else {
    // Production Firebase Auth logic
    const authResult = await firebaseAuthMiddleware(request);
    if (authResult) {
      // authResult is a NextResponse if auth failed
      return authResult;
    }
    // If authResult is null/undefined, middleware passed, get userId
    userId = getUserIdFromRequest(request); 
    if (!userId) { 
      // This case should ideally be handled by the middleware returning a response
      console.error('[API /upload] Auth middleware passed but userId still not found.');
      return NextResponse.json({ error: 'User authentication failed' }, { status: 401 });
    }
    console.log('[API /upload] Firebase Auth verified. User ID:', userId);
  }
  // --- END DEVELOPMENT ONLY ---

  // Safeguard, though the above logic should ensure userId is set.
  if (!userId) {
    console.error('[API /upload] CRITICAL: userId not set after auth block.');
    return NextResponse.json({ error: 'Internal server error: User ID not determined.' }, { status: 500 });
  }

  try {
    // Get client IP for rate limiting
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for') || 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return getRateLimitResponse();
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null; // Standard File object

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'קובץ לא נמצא' }, // File not found
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [MIME_TYPE_JPEG, MIME_TYPE_PNG, MIME_TYPE_DOCX, MIME_TYPE_TXT, MIME_TYPE_XLSX, MIME_TYPE_XLS];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'סוג קובץ לא חוקי. מותר להעלות רק קבצי JPEG, PNG, DOCX, TXT, XLSX, ו-XLS.' },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'הקובץ גדול מדי. גודל מקסימלי הוא 5MB.' }, // File too large
        { status: 400 }
      );
    }

    const originalFilename = sanitizeFilename(file.name || `document-${Date.now()}`);
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === MIME_TYPE_JPEG || file.type === MIME_TYPE_PNG) {
      // Image processing logic
      const timestamp = Date.now();
      const detectedExtension = file.type.split('/')[1];
      const storageFilename = `upload-${timestamp}.${detectedExtension}`;
      const storagePath = `uploads/${userId}/${storageFilename}`;

      const bucket = getStorage().bucket();
      const fileRef = bucket.file(storagePath);
      await fileRef.save(buffer, { contentType: file.type, public: true });
      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      await adminDb.collection('users').doc(userId).collection('uploads').add({
        filename: originalFilename,
        storageFilename: storageFilename, // This field might be specific to direct storage, consider if needed for text docs
        url,
        timestamp: Date.now(),
        sourceType: 'image',
        processed: false, 
        size: file.size,
        contentType: file.type,
      });
      return NextResponse.json({ success: true, url, filename: originalFilename });

    } else if (file.type === MIME_TYPE_DOCX || file.type === MIME_TYPE_TXT || file.type === MIME_TYPE_XLSX || file.type === MIME_TYPE_XLS) {
      let extractedText: string | undefined;
      let sourceType: string;

      if (file.type === MIME_TYPE_DOCX) {
        sourceType = 'docx';
        try {
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value.trim();
        } catch (e: any) {
          console.error(`Error parsing DOCX ${originalFilename}:`, e);
          return NextResponse.json({ error: `Failed to parse DOCX file. ${e.message || ''}`.trim() }, { status: 400 });
        }
      } else if (file.type === MIME_TYPE_TXT) {
        sourceType = 'txt';
        extractedText = buffer.toString('utf-8').trim();
      } else if (file.type === MIME_TYPE_XLSX || file.type === MIME_TYPE_XLS) {
        sourceType = 'excel';
        try {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const rowTexts: string[] = [];
          workbook.SheetNames.forEach((sheetName: string) => {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
            jsonData.forEach(rowArray => {
              const rowContent = rowArray.map(cell => String(cell).trim()).join(' ').trim();
              if (rowContent) { // Only add non-empty rows
                rowTexts.push(rowContent);
              }
            });
          });
          
          if (rowTexts.length === 0) {
            console.log(`[API /upload ${sourceType.toUpperCase()}] No text content found in rows for "${originalFilename}".`);
            return NextResponse.json({ error: `No text content found in ${sourceType.toUpperCase()} file rows.` }, { status: 400 });
          }
          console.log(`[API /upload ${sourceType.toUpperCase()}] Extracted ${rowTexts.length} non-empty rows from "${originalFilename}".`);
          
          // This replaces the single extractedText variable for Excel files
          // The Q&A extraction logic below might need to be adapted if it relies on a single block of text.
          // For now, we'll pass the concatenation of rowTexts for Q&A, but ideally, Q&A would also be row-aware.
          extractedText = rowTexts.join('\n'); // For existing Q&A logic

        } catch (e: any) {
          console.error(`Error parsing Excel file ${originalFilename}:`, e);
          return NextResponse.json({ error: `Failed to parse Excel file. ${e.message || ''}`.trim() }, { status: 400 });
        }
      } else {
        // Should not be reached
        return NextResponse.json({ error: 'Internal error: Unhandled processed file type.' }, { status: 500 });
      }

      // Note: extractedText for DOCX/TXT is a single block. For Excel, it's now also a single block (concatenated rows).
      // The ideal row-by-row chunking for Excel will happen *after* this block.
      // The Q&A extraction below still uses the single 'extractedText'. This could be a future improvement area for Excel/tabular Q&A.
      if (!extractedText || extractedText.trim().length === 0) {
        return NextResponse.json({ error: `No extractable text found in ${sourceType.toUpperCase()} file.` }, { status: 400 });
      }
      
      let qaVectorsForPinecone: any[] = [];
      // --- Q&A Extraction and Storage (uses 'extractedText') ---
      console.log(`[API /upload ${sourceType.toUpperCase()}] Starting Q&A extraction for ${originalFilename}.`);
      // ... (existing Q&A logic remains unchanged for now, operating on concatenated text for Excel)
      if (extractedText && extractedText.trim().length > 0) {
          let qas: QA[] = [];
          try {
              qas = await extractQAFromTextWithLLM(extractedText);
              console.log(`[API /upload ${sourceType.toUpperCase()}] Q&A extraction completed for ${originalFilename}. Found ${qas.length} Q&A pairs.`);
          } catch (err: any) {
              console.error(`[API /upload ${sourceType.toUpperCase()}] Q&A extraction failed for ${originalFilename}:`, err.message, err.stack);
          }

          if (qas.length > 0) {
              console.log(`[API /upload ${sourceType.toUpperCase()}] Processing ${qas.length} Q&A pairs for ${originalFilename}.`);
              for (const qa of qas) {
                  let qaEmbedding = null;
                  try {
                      const embeddingArr = await generateEmbeddings([qa.question]);
                      qaEmbedding = embeddingArr[0];
                  } catch (embedErr: any) { 
                      console.error(`[API /upload ${sourceType.toUpperCase()}] Embedding error for Q&A question "${qa.question.substring(0,50)}...":`, embedErr.message);
                  } 

                  const firestoreTimestamp = Date.now();
                  const qaSourceUrl = `${sourceType}://${originalFilename}`;

                  try {
                      await adminDb.collection('training').add({
                          question: qa.question,
                          answer: qa.answer,
                          sourceUrl: qaSourceUrl,
                          embedding: qaEmbedding,
                          timestamp: firestoreTimestamp,
                          userId: userId,
                          sourceType: `${sourceType}-qa`
                      });
                  } catch (firestoreErr: any) {
                      console.error(`[API /upload ${sourceType.toUpperCase()}] Firestore error saving Q&A to 'training':`, firestoreErr.message);
                  }

                  try {
                      await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').add({
                          question: qa.question,
                          answer: qa.answer,
                          sourceUrl: qaSourceUrl,
                          embedding: qaEmbedding,
                          timestamp: firestoreTimestamp,
                          sourceType: `${sourceType}-qa`
                      });
                  } catch (firestoreEmbedErr: any) {
                      console.error(`[API /upload ${sourceType.toUpperCase()}] Error saving Q&A to 'trainingEmbeddings':`, firestoreEmbedErr.message);
                  }

                  if (qaEmbedding) {
                      qaVectorsForPinecone.push({ 
                          id: `qa-${userId}-${firestoreTimestamp}-${qas.indexOf(qa)}`,
                          values: qaEmbedding,
                          metadata: {
                              userId,
                              originalSourceUrl: qaSourceUrl,
                              sourceType: 'qa', 
                              question: qa.question,
                              answer: qa.answer,
                              originalFilename: originalFilename
                          },
                      });
                  }
              }
              console.log(`[API /upload ${sourceType.toUpperCase()}] Finished processing Q&A pairs for ${originalFilename}. ${qaVectorsForPinecone.length} Q&A vectors prepared.`);
          }
      } else {
          console.log(`[API /upload ${sourceType.toUpperCase()}] Skipping Q&A extraction as no text was extracted or text is empty for ${originalFilename}.`);
      }
      // --- End Q&A Extraction and Storage ---

      // --- Row-by-Row Chunking and Processing (for Excel, similar to Google Sheets) ---
      // For DOCX/TXT, rowTexts will be null/undefined, so we use 'extractedText'
      // For Excel, rowTexts is populated from the Excel parsing logic above.
      
      const textsToProcess: string[] = (sourceType === 'excel') 
          ? (await (async () => { // Re-extract rowTexts for Excel here for clarity, or pass from above
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const tempRowTexts: string[] = [];
                workbook.SheetNames.forEach((sheetName: string) => {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
                    jsonData.forEach(rowArray => {
                        const rowContent = rowArray.map(cell => String(cell).trim()).join(' ').trim();
                        if (rowContent) { tempRowTexts.push(rowContent); }
                    });
                });
                return tempRowTexts;
            })())
          : [extractedText]; // For DOCX/TXT, process the single block of text

      const allChunks: Array<{ text: string, rowIndex?: number, originalRowText?: string }> = [];
      let totalProcessedRows = 0;

      textsToProcess.forEach((docText, docIndex) => {
        const docSpecificChunks = chunkText(docText);
        docSpecificChunks.forEach(chunk => {
          allChunks.push({ 
            text: chunk, 
            rowIndex: sourceType === 'excel' ? docIndex : undefined, // rowIndex is relevant for Excel
            originalRowText: sourceType === 'excel' ? docText : undefined
          });
        });
        if (sourceType === 'excel') totalProcessedRows++;
      });
      
      if (allChunks.length === 0) { 
        console.error(`[API /upload ${sourceType.toUpperCase()}] No chunks produced for "${originalFilename}".`);
        return NextResponse.json({ error: 'No valid text chunks found after processing.' }, { status: 400 });
      }
      console.log(`[API /upload ${sourceType.toUpperCase()}] Created ${allChunks.length} total chunks for "${originalFilename}"` + (sourceType === 'excel' ? ` from ${totalProcessedRows} rows.` : '.'));

      // Tagging: Generate one set of tags based on a sample of rows/text
      let documentLevelTags: string[] = [sourceType, originalFilename, 'document'];
      if (sourceType === 'excel') documentLevelTags.push('spreadsheet', 'tabular data');

      try {
        const representativeTextForTags = textsToProcess.slice(0, Math.min(textsToProcess.length, 10)).join('\n');
        if (representativeTextForTags) {
          const representativeChunksForTags = chunkText(representativeTextForTags, 250, 0);
          if (representativeChunksForTags.length > 0) {
            console.log(`[API /upload ${sourceType.toUpperCase()}] Classifying tags for document sample of "${originalFilename}".`);
            documentLevelTags = await classifyTagsWithOpenAI(representativeChunksForTags[0]);
            if (!documentLevelTags.includes(sourceType)) documentLevelTags.push(sourceType);
            if (!documentLevelTags.includes(originalFilename)) documentLevelTags.push(originalFilename);
          }
        }
      } catch (tagError: any) {
        console.error(`[API /upload ${sourceType.toUpperCase()}] Error classifying tags for sample of "${originalFilename}":`, tagError.message);
      }
      console.log(`[API /upload ${sourceType.toUpperCase()}] Using document-level tags for "${originalFilename}": ${documentLevelTags.join(', ')}`);

      // Pinecone and Embedding
      if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
          console.error('Pinecone API Key or Index not configured.');
          return NextResponse.json({ error: 'Server configuration error for data processing.' }, { status: 500 });
      }
      const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
      const indexName = process.env.PINECONE_INDEX;
      const pineconeIndex = pinecone.index(indexName).namespace(`user-${userId}`);

      if (qaVectorsForPinecone.length > 0) { // Upsert Q&A vectors if any
          try {
              await pineconeIndex.upsert(qaVectorsForPinecone);
              console.log(`[API /upload ${sourceType.toUpperCase()}] Successfully upserted ${qaVectorsForPinecone.length} Q&A vectors to Pinecone for "${originalFilename}".`);
          } catch (pineconeError: any) {
              console.error(`[API /upload ${sourceType.toUpperCase()}] Error upserting Q&A vectors to Pinecone for "${originalFilename}":`, pineconeError.message);
          }
      }
      
      const now = Date.now();
      let embeddings: number[][];
      const chunkTextsForEmbedding = allChunks.map(c => c.text);
      try {
        console.log(`[API /upload ${sourceType.toUpperCase()}] Generating embeddings for ${chunkTextsForEmbedding.length} chunks from "${originalFilename}".`);
        embeddings = await generateEmbeddings(chunkTextsForEmbedding);
        if (!embeddings || embeddings.length !== chunkTextsForEmbedding.length) {
             console.error(`[API /upload ${sourceType.toUpperCase()}] Embedding generation mismatch. Expected ${chunkTextsForEmbedding.length}, got ${embeddings?.length} for "${originalFilename}".`);
             return NextResponse.json({ error: 'Embedding generation failed to produce expected number of embeddings.' }, { status: 500 });
        }
        console.log(`[API /upload ${sourceType.toUpperCase()}] Successfully generated ${embeddings.length} embeddings for "${originalFilename}".`);
      } catch (e: any) {
        console.error(`[API /upload ${sourceType.toUpperCase()}] Embedding API error for "${originalFilename}":`, e.message, e.stack);
        return NextResponse.json({ error: `Embedding generation failed. ${e.message || ''}`.trim() }, { status: 502 });
      }

      const vectors = allChunks.map((chunkData, i) => {
        const metadata: { [key: string]: string | number | boolean | string[] } = {
          userId: userId!,
          documentName: originalFilename,
          originalFilename,
          // originalRowText: chunkData.originalRowText, // Optional, ensure it's not undefined if used
          chunkIndex: i,
          sourceType,
          text: chunkData.text,
          tags: documentLevelTags,
          contentType: sourceType === 'excel' ? 'application/vnd.ms-excel-row' : file.type,
        };

        if (chunkData.rowIndex !== undefined) {
          metadata.rowIndex = chunkData.rowIndex;
        }

        return {
          id: `${userId}-${sourceType}-${originalFilename.replace(/[^a-zA-Z0-9]/g, '_')}-${now}-${chunkData.rowIndex ?? 'doc'}-${i}`, // Ensure ID is Pinecone-friendly
          values: embeddings[i],
          metadata,
        };
      });

      try {
        console.log(`[API /upload ${sourceType.toUpperCase()}] Upserting ${vectors.length} content vectors to Pinecone for "${originalFilename}".`);
        await pineconeIndex.upsert(vectors);
        console.log(`[API /upload ${sourceType.toUpperCase()}] Successfully upserted ${vectors.length} content vectors to Pinecone for "${originalFilename}".`);
      } catch (e: any) {
        console.error(`[API /upload ${sourceType.toUpperCase()}] Pinecone upsert error for content vectors of "${originalFilename}":`, e.message, e.stack);
        return NextResponse.json({ error: `Failed to save main data to knowledge base (Pinecone). ${e.message || ''}`.trim() }, { status: 502 });
      }

      const batch = adminDb.batch();
      vectors.forEach((vec) => {
        const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
        batch.set(chunkRef, { ...vec.metadata, createdAt: now });
      });
      try {
        console.log(`[API /upload ${sourceType.toUpperCase()}] Committing ${vectors.length} document metadata entries to Firestore for "${originalFilename}".`);
        await batch.commit();
        console.log(`[API /upload ${sourceType.toUpperCase()}] Successfully committed metadata to Firestore for "${originalFilename}".`);
      } catch (e: any) {
        console.error(`[API /upload ${sourceType.toUpperCase()}] Firestore batch commit error for "${originalFilename}":`, e.message, e.stack);
        return NextResponse.json({ error: `Failed to save metadata to database (Firestore). ${e.message || ''}`.trim() }, { status: 500 });
      }
      
      await adminDb.collection('processed_documents').add({
          userId,
          originalFilename,
          sourceType,
          rowCount: sourceType === 'excel' ? totalProcessedRows : undefined,
          chunkCount: allChunks.length,
          uploadedAt: now,
          status: 'processed',
          size: file.size, // Original file size
          contentType: file.type, 
      });
      console.log(`[API /upload ${sourceType.toUpperCase()}] Successfully logged processed document entry for "${originalFilename}".`);

      return NextResponse.json({
        success: true,
        message: `${sourceType.toUpperCase()} file "${originalFilename}" (from ${sourceType === 'excel' ? totalProcessedRows + ' rows, ' : ''}${allChunks.length} chunks) processed and ingested successfully.`,
        documentName: originalFilename,
        rowCount: sourceType === 'excel' ? totalProcessedRows : undefined,
        chunkCount: allChunks.length,
      });

    } else {
      // This case should ideally not be reached if file type validation is comprehensive
      return NextResponse.json({ error: 'Unsupported file type for processing.' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: `שגיאה בהעלאת הקובץ: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
