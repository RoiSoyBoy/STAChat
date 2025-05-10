import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';

export interface PineconeMatch {
  id: string;
  score: number;
  metadata: {
    userId: string;
    documentName: string;
    originalFilename: string;
    chunkIndex: number;
    sourceType: string;
    text?: string;
    url?: string;
    [key: string]: any;
  };
  values: number[];
}

export interface ContextResult {
  context: string;
  sources: Array<{
    id: string;
    documentName?: string;
    originalFilename?: string;
    chunkIndex?: number;
    sourceType?: string;
    url?: string;
    score: number;
  }>;
  citationMap: Record<number, {
    sourceType?: string;
    fileName?: string;
    url?: string;
    chunkIndex?: number;
    documentName?: string;
    originalFilename?: string;
  }>;
}

export async function generateContextFromPinecone({
  userId,
  question,
  pineconeApiKey,
  pineconeIndex,
  openaiApiKey,
  similarityThreshold = 0.75,
  topK = 5,
}: {
  userId: string;
  question: string;
  pineconeApiKey: string;
  pineconeIndex: string;
  openaiApiKey: string;
  similarityThreshold?: number;
  topK?: number;
}): Promise<ContextResult> {
  // 1. Embed the question
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const embeddingResp = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: question,
  });
  const embedding = embeddingResp.data[0].embedding;

  // 2. Query Pinecone (chain .namespace() for user)
  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  const index = pinecone.index(pineconeIndex).namespace(`user-${userId}`);
  const queryResp = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    includeValues: false,
  });
  const matches: PineconeMatch[] = (queryResp.matches || []) as any;

  // 3. Filter by similarity threshold
  const filtered = matches.filter(m => m.score >= similarityThreshold);
  if (filtered.length === 0) {
    return { context: '', sources: [], citationMap: {} };
  }

  // 4. Concatenate context and label sources
  const contextParts: string[] = [];
  const sources: ContextResult['sources'] = [];
  const citationMap: ContextResult['citationMap'] = {};
  filtered.forEach((match, idx) => {
    const n = idx + 1;
    let label = `Source [${n}] - `;
    if (match.metadata.sourceType === 'pdf') {
      label += `PDF: ${match.metadata.documentName || match.metadata.originalFilename}`;
    } else if (match.metadata.sourceType === 'web') {
      label += `URL: ${match.metadata.url || match.metadata.documentName}`;
    } else if (match.metadata.sourceType === 'faq') {
      label += `FAQ: ${match.metadata.documentName || match.metadata.originalFilename || match.metadata.url}`;
    } else {
      label += `${match.metadata.sourceType || 'Unknown'}: ${match.metadata.documentName || match.metadata.originalFilename || match.metadata.url}`;
    }
    contextParts.push(`${label}\nText: "${match.metadata.text || ''}"`);
    sources.push({
      id: match.id,
      documentName: match.metadata.documentName,
      originalFilename: match.metadata.originalFilename,
      chunkIndex: match.metadata.chunkIndex,
      sourceType: match.metadata.sourceType,
      url: match.metadata.url,
      score: match.score,
    });
    citationMap[n] = {
      sourceType: match.metadata.sourceType,
      fileName: match.metadata.documentName || match.metadata.originalFilename,
      url: match.metadata.url,
      chunkIndex: match.metadata.chunkIndex,
      documentName: match.metadata.documentName,
      originalFilename: match.metadata.originalFilename,
    };
  });
  return {
    context: contextParts.join('\n\n'),
    sources,
    citationMap,
  };
} 