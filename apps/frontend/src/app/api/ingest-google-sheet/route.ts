import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { adminDb } from '@/lib/firebaseAdmin';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { chunkText } from '@/ingestion/shared/chunkText';
import { generateEmbeddings } from '@/ingestion/shared/embedding';
import { getUserIdFromRequest, firebaseAuthMiddleware } from '@/lib/firebaseAuthMiddleware'; // Assuming auth is needed

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Helper to extract Sheet ID from URL
function extractSheetIdFromUrl(url: string): string | null {
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  let userId: string | null;

  // --- DEVELOPMENT ONLY: Firebase Auth Bypass ---
  if (process.env.NODE_ENV === 'development') {
    console.log('[API /ingest-google-sheet] DEVELOPMENT MODE: Firebase Auth skipped.');
    userId = 'dev-user-id'; 
    (request as any).userId = userId;
  } else {
    const authResult = await firebaseAuthMiddleware(request);
    if (authResult) return authResult;
    userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'User authentication failed' }, { status: 401 });
    }
  }
  // --- END DEVELOPMENT ONLY ---

  if (!userId) {
    return NextResponse.json({ error: 'Internal server error: User ID not determined.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const sheetUrl = body.sheetUrl as string;

    if (!sheetUrl) {
      return NextResponse.json({ error: 'Google Sheet URL is required' }, { status: 400 });
    }

    const sheetId = extractSheetIdFromUrl(sheetUrl);
    if (!sheetId) {
      return NextResponse.json({ error: 'Invalid Google Sheet URL format' }, { status: 400 });
    }

    // Initialize Google Sheets API client
    // This typically uses Application Default Credentials (ADC)
    // Ensure GOOGLE_APPLICATION_CREDENTIALS env var is set, or running in an env that provides ADC.
    // Or, use a service account key directly (less secure if not handled properly)
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      // If using a specific service account key file:
      // keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, 
      // Or if key components are in env vars:
      // credentials: {
      //   client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      //   private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      // }
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Get spreadsheet metadata to find sheet names
    let spreadsheetMeta;
    try {
      spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    } catch (e: any) {
      console.error('Error fetching Google Sheet metadata:', e.message);
      if (e.message.includes('PERMISSION_DENIED') || e.message.includes('not found')) {
        return NextResponse.json({ error: 'Permission denied or Sheet not found. Ensure the sheet is shared correctly with the service account or publicly accessible (viewer).', details: e.message }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to access Google Sheet metadata.', details: e.message }, { status: 500 });
    }
    
    const sheetTitles = spreadsheetMeta.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) {
      return NextResponse.json({ error: 'No sheets found in the Google Spreadsheet.' }, { status: 400 });
    }

    // 2. Fetch data from all sheets
    // Construct ranges like ['Sheet1!A:ZZ', 'Sheet2!A:ZZ']
    const ranges = sheetTitles.map(title => `${title}!A:ZZ`); // Fetch all columns
    
    let allSheetData;
    try {
      allSheetData = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: sheetId,
        ranges: ranges,
      });
    } catch (e: any) {
        console.error('Error fetching Google Sheet data:', e.message);
        return NextResponse.json({ error: 'Failed to fetch data from Google Sheet.', details: e.message }, { status: 500 });
    }

    let extractedText = '';
    const valueRanges = allSheetData.data.valueRanges || [];
    valueRanges.forEach(valueRange => {
      const sheetName = valueRange.range?.split('!')[0] || 'UnknownSheet';
      extractedText += `Sheet: ${sheetName}\n`;
      const rows = valueRange.values as any[][] | null;
      if (rows) {
        rows.forEach(row => {
          row.forEach(cell => {
            extractedText += String(cell).trim() + ' ';
          });
          extractedText += '\n';
        });
      }
      extractedText += '\n'; // Extra newline between sheets
    });
    extractedText = extractedText.trim();

    if (!extractedText) {
      return NextResponse.json({ error: 'No text content found in the Google Sheet.' }, { status: 400 });
    }

    const originalFilename = spreadsheetMeta.data.properties?.title || `google-sheet-${sheetId}`;
    const sourceType = 'googlesheet';

    // --- Start Ingestion Pipeline: Modified for Row-by-Row Processing ---
    const rowTexts: string[] = [];
    valueRanges.forEach(valueRange => {
      const rows = valueRange.values as any[][] | null;
      if (rows) {
        rows.forEach(rowArray => {
          const rowContent = rowArray.map(cell => String(cell).trim()).join(' ').trim();
          if (rowContent) { // Only add non-empty rows
            rowTexts.push(rowContent);
          }
        });
      }
    });

    if (rowTexts.length === 0) {
      console.log(`[API /ingest-google-sheet] No text content found in rows for "${originalFilename}".`);
      return NextResponse.json({ error: 'No text content found in the Google Sheet rows.' }, { status: 400 });
    }
    console.log(`[API /ingest-google-sheet] Extracted ${rowTexts.length} non-empty rows from "${originalFilename}".`);

    // Process each row: chunk it, and prepare for embedding
    const allChunks: Array<{ text: string, rowIndex: number, originalRowText: string }> = [];
    rowTexts.forEach((rowText, rowIndex) => {
      const rowSpecificChunks = chunkText(rowText); // Uses default chunkSize & overlap
      rowSpecificChunks.forEach(chunk => {
        allChunks.push({ text: chunk, rowIndex, originalRowText: rowText });
      });
    });

    if (allChunks.length === 0) {
      console.error(`[API /ingest-google-sheet] No chunks produced after processing rows for "${originalFilename}".`);
      return NextResponse.json({ error: 'No valid text chunks found after processing rows.' }, { status: 400 });
    }
    console.log(`[API /ingest-google-sheet] Created ${allChunks.length} total chunks from ${rowTexts.length} rows for "${originalFilename}".`);

    // Tagging: Generate one set of tags based on a sample of rows
    let sheetLevelTags: string[] = [sourceType, originalFilename, 'spreadsheet', 'tabular data']; // Default tags
    try {
      const representativeTextForTags = rowTexts.slice(0, Math.min(rowTexts.length, 10)).join('\n'); // Sample of first 10 rows
      if (representativeTextForTags) {
        // Chunk this representative text for tagging to avoid overly long input to OpenAI
        const representativeChunksForTags = chunkText(representativeTextForTags, 250, 0); // No overlap
        if (representativeChunksForTags.length > 0) {
            console.log(`[API /ingest-google-sheet] Classifying tags for sheet sample of "${originalFilename}".`);
            sheetLevelTags = await classifyTagsWithOpenAI(representativeChunksForTags[0]); // Classify first representative chunk
             // Add default tags back if not present, or merge
            if (!sheetLevelTags.includes(sourceType)) sheetLevelTags.push(sourceType);
            if (!sheetLevelTags.includes(originalFilename)) sheetLevelTags.push(originalFilename);
        }
      }
    } catch (tagError: any) {
        console.error(`[API /ingest-google-sheet] Error classifying tags for sheet sample of "${originalFilename}":`, tagError.message);
        // Keep default tags if error
    }
    console.log(`[API /ingest-google-sheet] Using sheet-level tags for "${originalFilename}": ${sheetLevelTags.join(', ')}`);

    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
      console.error('Pinecone API Key or Index not configured.');
      return NextResponse.json({ error: 'Server configuration error for data processing.' }, { status: 500 });
    }
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX;
    const pineconeIndex = pinecone.index(indexName).namespace(`user-${userId}`);
    
    const now = Date.now();
    let embeddings: number[][];
    const chunkTextsForEmbedding = allChunks.map(c => c.text);

    try {
      console.log(`[API /ingest-google-sheet] Generating embeddings for ${chunkTextsForEmbedding.length} chunks from "${originalFilename}".`);
      embeddings = await generateEmbeddings(chunkTextsForEmbedding);
      if (!embeddings || embeddings.length !== chunkTextsForEmbedding.length) {
        console.error(`[API /ingest-google-sheet] Embedding generation mismatch. Expected ${chunkTextsForEmbedding.length}, got ${embeddings?.length} for "${originalFilename}".`);
        return NextResponse.json({ error: 'Embedding generation failed to produce expected number of embeddings.' }, { status: 500 });
      }
      console.log(`[API /ingest-google-sheet] Successfully generated ${embeddings.length} embeddings for "${originalFilename}".`);
    } catch (e: any) {
      console.error(`[API /ingest-google-sheet] Embedding API error for "${originalFilename}":`, e.message, e.stack);
      return NextResponse.json({ error: `Embedding generation failed. ${e.message || ''}`.trim() }, { status: 502 });
    }

    const vectors = allChunks.map((chunkData, i) => ({
      id: `${userId}-${sourceType}-${sheetId}-${now}-${chunkData.rowIndex}-${i}`, // More specific ID
      values: embeddings[i],
      metadata: {
        userId,
        documentName: originalFilename, // Sheet title
        originalFilename, 
        sheetUrl: sheetUrl, 
        sheetId: sheetId,
        rowIndex: chunkData.rowIndex, // Store original row index
        // originalRowText: chunkData.originalRowText, // Optionally store full original row text if needed
        chunkIndex: i, // Index within allChunks for this sheet
        sourceType,
        text: chunkData.text, // The actual chunk content
        tags: sheetLevelTags, // Apply sheet-level tags to all chunks
        contentType: 'text/googlesheet-row', // More specific content type
      },
    }));

    try {
      console.log(`[API /ingest-google-sheet] Upserting ${vectors.length} vectors to Pinecone for "${originalFilename}".`);
      await pineconeIndex.upsert(vectors);
      console.log(`[API /ingest-google-sheet] Successfully upserted ${vectors.length} vectors to Pinecone for "${originalFilename}".`);
    } catch (e: any) {
      console.error(`[API /ingest-google-sheet] Pinecone upsert error for "${originalFilename}":`, e.message, e.stack);
      return NextResponse.json({ error: `Failed to save data to knowledge base (Pinecone). ${e.message || ''}`.trim() }, { status: 502 });
    }

    const batch = adminDb.batch();
    vectors.forEach((vec) => {
      const docRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
      batch.set(docRef, { ...vec.metadata, createdAt: now });
    });
    
    try {
      console.log(`[API /ingest-google-sheet] Committing ${vectors.length} document metadata entries to Firestore for "${originalFilename}".`);
      await batch.commit();
      console.log(`[API /ingest-google-sheet] Successfully committed metadata to Firestore for "${originalFilename}".`);
    } catch (e: any) {
      console.error(`[API /ingest-google-sheet] Firestore batch commit error for "${originalFilename}":`, e.message, e.stack);
      return NextResponse.json({ error: `Failed to save metadata to database (Firestore). ${e.message || ''}`.trim() }, { status: 500 });
    }
    
    // Log processed document
    try {
      await adminDb.collection('processed_documents').add({
          userId,
          originalFilename, // Sheet title
          sourceType,
          sourceUrl: sheetUrl, // The full URL
          chunkCount: allChunks.length, // Use total number of chunks from rows
          rowCount: rowTexts.length, // Add row count
          uploadedAt: now, // Or ingestedAt
          status: 'processed',
          contentType: 'text/googlesheet-row',
      });
      console.log(`[API /ingest-google-sheet] Successfully logged processed document entry for "${originalFilename}".`);
    } catch (e: any) {
      console.error(`[API /ingest-google-sheet] Error logging to 'processed_documents' for "${originalFilename}":`, e.message, e.stack);
      // Non-critical, so don't return error, but log it
    }

    console.log(`[API /ingest-google-sheet] Successfully processed and ingested Google Sheet "${originalFilename}".`);
    return NextResponse.json({
      success: true,
      message: `Google Sheet "${originalFilename}" (from ${rowTexts.length} rows, ${allChunks.length} chunks) processed and ingested successfully.`,
      sheetTitle: originalFilename,
      rowCount: rowTexts.length,
      chunkCount: allChunks.length,
    });

  } catch (error: any) {
    console.error('Error ingesting Google Sheet:', error);
    return NextResponse.json(
      { error: `Error ingesting Google Sheet: ${error.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
