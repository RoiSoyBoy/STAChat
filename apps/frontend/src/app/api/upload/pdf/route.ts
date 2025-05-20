import { NextRequest, NextResponse } from 'next/server';
import formidable from 'formidable';
import pdfParse from 'pdf-parse';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { adminDb, getAuth } from '@/lib/firebaseAdmin'; // Combined and updated import
import { headers } from 'next/headers';
import { Readable } from 'stream';
import { classifyTagsWithOpenAI } from '@/ingestion/shared/classifyTagsWithOpenAI';
import { chunkText } from '@/ingestion/shared/chunkText';
import { generateEmbeddings } from '@/ingestion/shared/embedding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Canonical endpoint for PDF document ingestion.
// Flow: Auth -> Parse multipart form -> PDF parse -> Chunking (chunkText) -> Tagging (classifyTagsWithOpenAI) -> Embedding (generateEmbeddings) -> Store in Pinecone & Firestore -> Logging.
// Handles user scoping, robust error handling, and document metadata.
//
// See also: /fetch-url for web ingestion, /chat for RAG chat.

// Helper: Parse multipart form with formidable
function parseForm(req: any): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filter: part => part.mimetype === 'application/pdf',
    });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Helper: Sanitize filename
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Type guard for formidable.File
function isFormidableFile(file: any): file is formidable.File {
  return (
    file &&
    typeof file === 'object' &&
    typeof file.filepath === 'string' &&
    typeof file.originalFilename === 'string'
  );
}

export async function POST(req: NextRequest) {
  try {
    // Firebase Auth: verify user
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid auth token' }, { status: 401 });
    }
    const idToken = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(idToken);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid or expired auth token' }, { status: 401 });
    }
    const userId = decoded.uid;
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Parse form
    const { files, fields } = await parseForm((req as any).req);
    const fileRaw = files.file;
    const fileCandidate = Array.isArray(fileRaw) ? fileRaw[0] : fileRaw;
    if (!isFormidableFile(fileCandidate)) {
      return NextResponse.json({ error: 'No PDF file uploaded' }, { status: 400 });
    }
    const pdfFile = fileCandidate;
    const originalFilename = sanitizeFilename(pdfFile.originalFilename || 'document.pdf');

    // Read PDF buffer
    const buffer = await fsReadFileAsync(pdfFile.filepath);
    let pdfData;
    try {
      pdfData = await pdfParse(buffer);
    } catch (e) {
      return NextResponse.json({ error: 'Failed to parse PDF. Is it a scanned file?' }, { status: 400 });
    }
    const text = pdfData.text?.trim();
    if (!text) {
      return NextResponse.json({ error: 'No extractable text found in PDF.' }, { status: 400 });
    }

    // Chunk text
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'No valid text chunks found.' }, { status: 400 });
    }

    // Limit number of chunks for tagging to avoid overuse
    const maxChunksForTags = 10;
    const tagChunks = chunks.slice(0, maxChunksForTags);
    let tagsArr: string[][] = [];
    for (const chunk of tagChunks) {
      const tags = await classifyTagsWithOpenAI(chunk);
      tagsArr.push(tags);
    }
    // For chunks beyond the limit, use default tags
    while (tagsArr.length < chunks.length) {
      tagsArr.push(['general', 'uncategorized']);
    }

    // Pinecone
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const index = pinecone.index(process.env.PINECONE_INDEX!).namespace(`user-${userId}`);
    const now = Date.now();
    let embeddings: number[][] = [];
    try {
      embeddings = await generateEmbeddings(chunks);
    } catch (e) {
      return NextResponse.json({ error: 'Embedding API error or rate limit.' }, { status: 502 });
    }
    const vectors = chunks.map((chunk, i) => ({
      id: `${userId}-${now}-${i}`,
      values: embeddings[i],
      metadata: {
        userId,
        documentName: originalFilename,
        originalFilename,
        chunkIndex: i,
        sourceType: 'pdf',
        text: chunk,
        tags: tagsArr[i],
      },
    }));
    try {
      await index.upsert(vectors);
    } catch (e) {
      return NextResponse.json({ error: 'Pinecone upsert error.' }, { status: 502 });
    }

    // Save metadata to Firestore for each chunk
    const batch = adminDb.batch();
    vectors.forEach((vec, i) => {
      const chunkRef = adminDb.collection('users').doc(userId).collection('uploads').doc(vec.id);
      batch.set(chunkRef, {
        userId,
        documentName: originalFilename,
        originalFilename,
        chunkIndex: i,
        sourceType: 'pdf',
        text: chunks[i],
        tags: tagsArr[i],
        createdAt: now,
      });
    });
    await batch.commit();

    // Optionally, save document-level metadata
    await adminDb.collection('pdf_uploads').add({
      userId,
      originalFilename,
      chunkCount: chunks.length,
      uploadedAt: now,
      sourceType: 'pdf',
    });

    return NextResponse.json({
      success: true,
      chunkCount: chunks.length,
      documentName: originalFilename,
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper: promisified fs.readFile
import { promises as fs } from 'fs';
async function fsReadFileAsync(path: string) {
  return fs.readFile(path);
}
