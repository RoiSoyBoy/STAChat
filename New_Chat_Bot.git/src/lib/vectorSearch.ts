import { adminDb } from './firebase-admin';
import OpenAI from 'openai';

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

interface WebEmbeddingDoc {
  id: string;
  url: string;
  heading: string;
  text: string;
  embedding: number[];
  createdAt: number;
}

export async function findMostSimilarChunks(query: string, topN = 5) {
  const queryEmbedding = await getEmbeddingForQuery(query);
  const snapshot = await adminDb.collection('web_embeddings').get();
  const docs: WebEmbeddingDoc[] = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<WebEmbeddingDoc, 'id'>) }));

  // Compute similarity for each chunk
  const scored = docs.map(doc => ({
    ...doc,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  // Sort by similarity, descending
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topN);
} 