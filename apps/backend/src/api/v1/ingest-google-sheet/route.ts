import { NextRequest, NextResponse } from 'next/server';
import { google, sheets_v4 } from 'googleapis'; // Added sheets_v4 for types
import { adminDb } from '@/lib/firebaseAdmin';
import { Pinecone } from '@pinecone-database/pinecone';
import { classifyTagsWithOpenAI } from '@/lib/ingestion/classifyTagsWithOpenAI';
import { chunkText } from 'shared'; // Corrected path: import from shared package
import { generateEmbeddings } from '@/lib/embedding'; // Path seems correct, file exists
// getUserIdFromRequest and firebaseAuthMiddleware are Express-style, cannot be used directly here.
// We will inline the auth logic for NextRequest.
import { getAuth } from '@/lib/firebaseAdmin'; // Ensure getAuth is available for token verification

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
    // In development, BYPASS_FIREBASE_AUTH might also be checked by other parts,
    // but for this route, NODE_ENV=development is enough to set a dev-user-id.
    userId = process.env.DEV_USER_ID || 'dev-user-id'; // Use DEV_USER_ID from env if set
    (request as any).userId = userId; // For potential downstream use if request object is passed around (though less common in Next.js API routes)
  } else {
    // Production Firebase Auth logic for NextRequest
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid auth token' }, { status: 401 });
    }
    const idToken = authHeader.split(' ')[1];
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      if (!decodedToken || !decodedToken.uid) {
        return NextResponse.json({ error: 'User not found in token' }, { status: 401 });
      }
      userId = decodedToken.uid;
      // Optionally, attach to request if any downstream utility expects it, though direct use of userId is cleaner.
      // (request as any).userId = userId; 
      // (request as any).user = { id: userId, uid: userId, email: decodedToken.email };
    } catch (e) {
      console.error('[API /ingest-google-sheet] Firebase Auth Error:', e);
      return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
    }
  }
  // --- END Firebase Auth Logic ---

  if (!userId) {
    // This case should ideally be caught by the logic above, returning 401.
    // If it's reached, it's an unexpected state.
    console.error('[API /ingest-google-sheet] Critical: User ID not determined after auth block.');
    return NextResponse.json({ error: 'User authentication failed or user ID not determined.' }, { status: 500 });
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
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
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
    
    const sheetTitles = spreadsheetMeta.data.sheets?.map((s: sheets_v4.Schema$Sheet) => s.properties?.title).filter(Boolean) as string[] || [];
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
    valueRanges.forEach((valueRange: sheets_v4.Schema$ValueRange) => {
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

    // --- Start Ingestion Pipeline: Modified for Row-by-Row Processing with Headers ---
    const rowObjectsForProcessing: Array<{ sheetName: string, sheetIndex: number, rowIndexInSheet: number, data: string }> = [];
    
    valueRanges.forEach((valueRange: sheets_v4.Schema$ValueRange, sheetIndex: number) => { // Added sheetIndex
      const sheetName = valueRange.range?.split('!')[0] || `UnknownSheet_${sheetIndex}`; // Use index if name is problematic
      const rows = valueRange.values as any[][] | null;
      if (rows && rows.length > 0) {
        const headers = rows[0].map(header => String(header).trim()); // First row as headers
        
        rows.slice(1).forEach((rowArray, rowIndex) => { // Process data rows (skip header row)
          let rowContent = "";
          if (rowArray.length > 0) { // Ensure row is not empty
            rowContent = rowArray
              .map((cell, cellIndex) => {
                const header = headers[cellIndex] || `column_${cellIndex + 1}`;
                return `${header}: ${String(cell).trim()}`;
              })
              .join(', '); // Join field-value pairs
          }

          if (rowContent.trim()) { // Only add non-empty processed rows
            rowObjectsForProcessing.push({
              sheetName,
              sheetIndex, // Store sheetIndex
              rowIndexInSheet: rowIndex + 1, // 0-indexed data row, +1 for 1-indexed sheet row (after header)
              data: rowContent.trim()
            });
          }
        });
      }
    });

    if (rowObjectsForProcessing.length === 0) {
      console.log(`[API /ingest-google-sheet] No processable row content found in "${originalFilename}".`);
      return NextResponse.json({ error: 'No processable text content found in the Google Sheet rows.' }, { status: 400 });
    }
    console.log(`[API /ingest-google-sheet] Extracted ${rowObjectsForProcessing.length} processable rows from "${originalFilename}".`);

    // Process each processed row object: chunk its 'data' field
    const allChunks: Array<{ text: string, sheetName: string, sheetIndex: number, rowIndexInSheet: number, originalRowData: string }> = [];
    rowObjectsForProcessing.forEach((rowObject) => {
      const rowSpecificChunks = chunkText(rowObject.data); // Chunk the "Header: Value, Header: Value" string
      rowSpecificChunks.forEach((chunk: string) => {
        allChunks.push({ 
          text: chunk, 
          sheetName: rowObject.sheetName, // Keep for metadata
          sheetIndex: rowObject.sheetIndex, // Pass sheetIndex for ID generation
          rowIndexInSheet: rowObject.rowIndexInSheet,
          originalRowData: rowObject.data // Store the structured "Header: Value..." string
        });
      });
    });

    if (allChunks.length === 0) {
      console.error(`[API /ingest-google-sheet] No chunks produced after processing rows for "${originalFilename}".`);
      return NextResponse.json({ error: 'No valid text chunks found after processing rows.' }, { status: 400 });
    }
    console.log(`[API /ingest-google-sheet] Created ${allChunks.length} total chunks from ${rowObjectsForProcessing.length} rows for "${originalFilename}".`);

    // Tagging: Generate one set of tags based on a sample of processed row data
    let sheetLevelTags: string[] = [sourceType, originalFilename, 'spreadsheet', 'tabular data']; // Default tags
    try {
      const representativeTextForTags = rowObjectsForProcessing
        .slice(0, Math.min(rowObjectsForProcessing.length, 5)) // Sample of first 5 processed rows
        .map(r => r.data)
        .join('\n\n'); 
      if (representativeTextForTags) {
        const representativeChunksForTags = chunkText(representativeTextForTags, 300, 0); // Chunk for tagging, slightly larger
        if (representativeChunksForTags.length > 0) {
            console.log(`[API /ingest-google-sheet] Classifying tags for sheet sample of "${originalFilename}".`);
            sheetLevelTags = await classifyTagsWithOpenAI(representativeChunksForTags[0]);
            if (!sheetLevelTags.includes(sourceType)) sheetLevelTags.push(sourceType);
            // No need to push originalFilename if it's already part of the tags from OpenAI or default
            if (!sheetLevelTags.some(tag => tag.toLowerCase() === originalFilename.toLowerCase())) {
                 sheetLevelTags.push(originalFilename);
            }
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
      id: `${userId}-${sourceType}-${sheetId}-s${chunkData.sheetIndex}-r${chunkData.rowIndexInSheet}-c${i}`, // ASCII ID using sheetIndex
      values: embeddings[i],
      metadata: {
        userId,
        documentName: originalFilename, 
        sheetName: chunkData.sheetName, // Keep original sheetName for metadata
        sheetIndex: chunkData.sheetIndex, // Store sheetIndex in metadata
        originalFilename, 
        sheetUrl: sheetUrl, 
        sheetId: sheetId,
        rowIndexInSheet: chunkData.rowIndexInSheet, 
        // originalRowData: chunkData.originalRowData, 
        chunkIndex: i, 
        sourceType,
        text: chunkData.text, 
        tags: sheetLevelTags, 
        contentType: 'text/googlesheet-row-structured', 
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
          originalFilename, 
          sourceType,
          sourceUrl: sheetUrl, 
          chunkCount: allChunks.length, 
          rowCount: rowObjectsForProcessing.length, // Use count of processed rows
          uploadedAt: now, 
          status: 'processed',
          contentType: 'text/googlesheet-row-structured',
      });
      console.log(`[API /ingest-google-sheet] Successfully logged processed document entry for "${originalFilename}".`);
    } catch (e: any) {
      console.error(`[API /ingest-google-sheet] Error logging to 'processed_documents' for "${originalFilename}":`, e.message, e.stack);
      // Non-critical, so don't return error, but log it
    }

    console.log(`[API /ingest-google-sheet] Successfully processed and ingested Google Sheet "${originalFilename}".`);
    return NextResponse.json({
      success: true,
      message: `Google Sheet "${originalFilename}" (from ${rowObjectsForProcessing.length} rows, ${allChunks.length} chunks) processed and ingested successfully.`,
      sheetTitle: originalFilename,
      rowCount: rowObjectsForProcessing.length,
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
