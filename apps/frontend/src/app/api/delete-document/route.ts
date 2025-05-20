import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Pinecone } from '@pinecone-database/pinecone';

export async function POST(req: NextRequest) {
  console.log('[API /api/delete-document] Received POST request.');
  try {
    const body = await req.json();
    const { identifier, documentType, userId } = body; // identifier can be URL or filename

    if (!identifier || !documentType || !userId) {
      console.error('[API /api/delete-document] Missing identifier, documentType, or userId in request body.');
      return NextResponse.json({ error: 'Missing identifier, documentType, or userId' }, { status: 400 });
    }

    console.log(`[API /api/delete-document] Attempting to delete data for ${documentType}: ${identifier}, userId: ${userId}`);

    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeIndexName = process.env.PINECONE_INDEX;

    if (!pineconeApiKey || !pineconeIndexName) {
      console.error('[API /api/delete-document] Pinecone API Key or Index Name not configured.');
      return NextResponse.json({ error: 'Pinecone configuration missing on server' }, { status: 500 });
    }

    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const index = pinecone.index(pineconeIndexName).namespace(`user-${userId}`);

    let deletedMainChunkIdsCount = 0;
    let deletedQaChunksByFilter = false;
    const firestoreDeletePromises: Promise<any>[] = [];

    if (documentType === 'url') {
      const urlToDelete = identifier;
      // 1. Delete 'web' chunks (sourceType: 'web') from Pinecone by ID and their Firestore metadata
      console.log(`[API /api/delete-document] Fetching 'web' chunk metadata from Firestore for url: ${urlToDelete}`);
      const webChunksSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('urls') // Collection for URL chunks
        .where('url', '==', urlToDelete)
        .get();

      const webChunkVectorIds: string[] = [];
      if (!webChunksSnapshot.empty) {
        webChunksSnapshot.forEach(doc => {
          webChunkVectorIds.push(doc.id); // doc.id is the Pinecone vector ID
          firestoreDeletePromises.push(doc.ref.delete());
        });

        if (webChunkVectorIds.length > 0) {
          console.log(`[API /api/delete-document] Deleting ${webChunkVectorIds.length} 'web' chunk vectors from Pinecone for URL.`);
          try {
            await index.deleteMany(webChunkVectorIds);
            deletedMainChunkIdsCount = webChunkVectorIds.length;
          } catch (e: any) { return NextResponse.json({ error: `Error deleting 'web' chunks from Pinecone: ${e.message}` }, { status: 500 }); }
        }
      } else {
        console.log(`[API /api/delete-document] No 'web' chunks found in Firestore for url: ${urlToDelete}`);
      }

      // 2. Delete 'qa' vectors from Pinecone using metadata filter for URL
      console.log(`[API /api/delete-document] Deleting 'qa' vectors from Pinecone for url: ${urlToDelete}`);
      try {
        await index.deleteMany({ originalSourceUrl: urlToDelete, sourceType: 'qa' });
        deletedQaChunksByFilter = true;
      } catch (e: any) { return NextResponse.json({ error: `Error deleting 'qa' chunks by filter from Pinecone for URL: ${e.message}` }, { status: 500 }); }
      
      // 3. Delete 'qa' entries from Firestore 'training' and 'trainingEmbeddings' for URL
      const trainingSnapshotUrl = await adminDb.collection('training').where('sourceUrl', '==', urlToDelete).get();
      trainingSnapshotUrl.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));
      
      const trainingEmbeddingsSnapshotUrl = await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').where('sourceUrl', '==', urlToDelete).get();
      trainingEmbeddingsSnapshotUrl.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));

      // 4. Delete main log entry from 'web_uploads'
      const webUploadsSnapshot = await adminDb.collection('web_uploads').where('url', '==', urlToDelete).where('userId', '==', userId).get();
      webUploadsSnapshot.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));

    } else if (documentType === 'pdf') {
      const pdfFilename = identifier;
      // 1. Delete 'pdf' chunks (sourceType: 'pdf') from Pinecone by ID and their Firestore metadata
      console.log(`[API /api/delete-document] Fetching 'pdf' chunk metadata from Firestore for filename: ${pdfFilename}`);
      const pdfChunksSnapshot = await adminDb
        .collection('users')
        .doc(userId)
        .collection('uploads') // Collection for PDF chunks
        .where('originalFilename', '==', pdfFilename)
        .where('sourceType', '==', 'pdf') // Ensure we only get PDF chunks
        .get();

      const pdfChunkVectorIds: string[] = [];
      if (!pdfChunksSnapshot.empty) {
        pdfChunksSnapshot.forEach(doc => {
          pdfChunkVectorIds.push(doc.id); // doc.id is the Pinecone vector ID
          firestoreDeletePromises.push(doc.ref.delete());
        });

        if (pdfChunkVectorIds.length > 0) {
          console.log(`[API /api/delete-document] Deleting ${pdfChunkVectorIds.length} 'pdf' chunk vectors from Pinecone.`);
          try {
            await index.deleteMany(pdfChunkVectorIds);
            deletedMainChunkIdsCount = pdfChunkVectorIds.length;
          } catch (e: any) { return NextResponse.json({ error: `Error deleting 'pdf' chunks from Pinecone: ${e.message}` }, { status: 500 }); }
        }
      } else {
        console.log(`[API /api/delete-document] No 'pdf' chunks found in Firestore for filename: ${pdfFilename}`);
      }

      // 2. Delete 'qa' vectors from Pinecone using metadata filter for PDF
      // 'originalFilename' is used in 'qa' metadata for PDFs, as seen in process-pdf
      console.log(`[API /api/delete-document] Deleting 'qa' vectors from Pinecone for PDF filename: ${pdfFilename}`);
      try {
        await index.deleteMany({ originalFilename: pdfFilename, sourceType: 'qa' });
        deletedQaChunksByFilter = true;
      } catch (e: any) { return NextResponse.json({ error: `Error deleting 'qa' chunks by filter from Pinecone for PDF: ${e.message}` }, { status: 500 }); }

      // 3. Delete 'qa' entries from Firestore 'training' and 'trainingEmbeddings' for PDF
      // Q&A from PDFs uses sourceUrl like `pdf://${pdfFilename}`
      const pdfQaSourceUrl = `pdf://${pdfFilename}`;
      const trainingSnapshotPdf = await adminDb.collection('training').where('sourceUrl', '==', pdfQaSourceUrl).get();
      trainingSnapshotPdf.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));
      
      const trainingEmbeddingsSnapshotPdf = await adminDb.collection('trainingEmbeddings').doc(userId).collection('qas').where('sourceUrl', '==', pdfQaSourceUrl).get();
      trainingEmbeddingsSnapshotPdf.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));
      
      // 4. Delete main log entry from 'pdf_uploads'
      const pdfUploadsSnapshot = await adminDb.collection('pdf_uploads').where('originalFilename', '==', pdfFilename).where('userId', '==', userId).get();
      pdfUploadsSnapshot.forEach(doc => firestoreDeletePromises.push(doc.ref.delete()));

    } else {
      console.error(`[API /api/delete-document] Unsupported documentType: ${documentType}`);
      return NextResponse.json({ error: `Unsupported documentType: ${documentType}` }, { status: 400 });
    }

    // Execute all Firestore deletions
    if (firestoreDeletePromises.length > 0) {
      console.log(`[API /api/delete-document] Committing ${firestoreDeletePromises.length} Firestore delete operations.`);
      await Promise.all(firestoreDeletePromises);
      console.log(`[API /api/delete-document] Successfully deleted associated Firestore documents.`);
    }

    console.log(`[API /api/delete-document] Deletion process completed for ${documentType}: ${identifier}, userId: ${userId}`);
    return NextResponse.json({
      message: `Deletion process initiated for ${documentType}: ${identifier}.`,
      deletedMainChunkIdsCount,
      deletedQaChunksByFilter,
      firestoreDocsScheduledForDeletion: firestoreDeletePromises.length,
    });

  } catch (error: any) {
    console.error('[API /api/delete-document] General error in POST handler:', error.message, error.stack);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
