import { adminDb, Timestamp, QueryDocumentSnapshot } from './firebaseAdmin'; // Updated import
import OpenAI from 'openai';
import { WebEmbeddingDoc } from './types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getEmbeddingForQuery(query: string) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: query,
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function findMostSimilarChunks(query: string, topN = 5): Promise<WebEmbeddingDoc[]> {
  const queryEmbedding = await getEmbeddingForQuery(query);
  const snapshot = await adminDb.collection('web_embeddings').get();
  
  const docs: WebEmbeddingDoc[] = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
    // Explicitly cast data and handle potential Timestamp for createdAt
    const rawData = doc.data();
    if (!rawData) {
      // This should ideally not happen if a document exists, but good for safety
      console.error(`Document ${doc.id} has no data. Skipping.`);
      // Return a value that can be filtered out or throw an error
      // For now, returning null and filtering later, or ensure your logic can handle it.
      // However, the return type is WebEmbeddingDoc[], so this path needs careful handling.
      // A robust way is to filter out such docs before this map, or throw.
      // Let's assume data always exists if doc does for now, or throw.
      throw new Error(`Document ${doc.id} returned no data from doc.data()`);
    }

    // Assert the basic structure, allowing createdAt to be Timestamp or number
    const data = rawData as Omit<WebEmbeddingDoc, 'id' | 'createdAt'> & { createdAt?: number | Timestamp | null };

    let createdAtAsNumber: number;
    if (data.createdAt instanceof Timestamp) {
      createdAtAsNumber = data.createdAt.toMillis();
    } else if (typeof data.createdAt === 'number') {
      createdAtAsNumber = data.createdAt;
    } else {
      // If createdAt is missing or of an unexpected type, log and use a default or throw.
      // Using 0 as a fallback, but this might hide issues.
      console.warn(`Document ${doc.id} has missing or invalid 'createdAt' field. Defaulting to 0.`);
      createdAtAsNumber = 0;
    }

    return {
      id: doc.id,
      url: data.url, // Assumes data.url is string as per WebEmbeddingDoc
      heading: data.heading, // Assumes data.heading is string
      text: data.text, // Assumes data.text is string
      embedding: data.embedding, // Assumes data.embedding is number[]
      createdAt: createdAtAsNumber,
    };
  });

  // Compute similarity for each chunk
  const scored: WebEmbeddingDoc[] = docs.map((doc: WebEmbeddingDoc) => ({
    ...doc,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // Sort by similarity, descending
  scored.sort((a, b) => b.similarity! - a.similarity!);

  return scored.slice(0, topN);
}
// Refreshing module status
