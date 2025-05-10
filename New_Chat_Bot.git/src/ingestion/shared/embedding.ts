import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Centralized utility for generating OpenAI embeddings for arrays of text chunks.
// Used by all ingestion endpoints to ensure consistent embedding logic and error handling.
//
// Used by: /upload/pdf, /fetch-url, and any endpoint needing embeddings for chunked text.

/**
 * Generate OpenAI embeddings for an array of texts.
 * @param texts Array of strings to embed
 * @param model Embedding model (default: 'text-embedding-ada-002')
 * @returns Array of embeddings (number[][])
 */
export async function generateEmbeddings(texts: string[], model: string = 'text-embedding-ada-002'): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const text of texts) {
    try {
      const resp = await openai.embeddings.create({
        model,
        input: text,
      });
      embeddings.push(resp.data[0].embedding);
    } catch (e) {
      console.error('Embedding error for text:', text.slice(0, 100), e);
      // Push a zero vector if error (or you can throw, depending on use case)
      embeddings.push(Array(1536).fill(0));
    }
  }
  return embeddings;
} 