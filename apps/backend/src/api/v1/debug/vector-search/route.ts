import { NextRequest, NextResponse } from 'next/server';
import { generateContextFromPinecone, ContextResult } from '@/lib/generateContextFromPinecone';
import logger from '@/lib/logger';

// Ensure necessary environment variables are checked, similar to chat.service.ts
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
  throw new Error('Debug Endpoint: Missing one or more required environment variables: PINECONE_API_KEY, PINECONE_INDEX_NAME, OPENAI_API_KEY');
}

interface DebugVectorSearchRequestBody {
  question: string;
  userId: string; // This will be used for namespacing, e.g., 'tenant-abc-789'
  similarityThreshold?: number;
  topK?: number;
  // skipFilters is not directly applicable to generateContextFromPinecone as it uses namespaces.
  // If skipFilters meant querying root, generateContextFromPinecone would need modification
  // or a different function would be called.
  // For now, this endpoint will use the namespaced query.
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DebugVectorSearchRequestBody;
    const { question, userId, similarityThreshold, topK } = body;

    if (!question || !userId) {
      return NextResponse.json({ error: 'Missing required fields: question, userId' }, { status: 400 });
    }

    logger.info(`[DebugVectorSearch] Request received for userId: ${userId}, question: "${question}"`);

    // Call generateContextFromPinecone, which includes the new detailed logging
    const result: ContextResult = await generateContextFromPinecone({
      userId: userId, // Used for namespacing
      question: question,
      pineconeApiKey: PINECONE_API_KEY!,
      pineconeIndex: PINECONE_INDEX_NAME!,
      openaiApiKey: OPENAI_API_KEY!,
      similarityThreshold: similarityThreshold ?? 0.0, // Default to 0 to see all scores if not provided
      topK: topK ?? 10, // Default to 10 if not provided
    });

    logger.info(`[DebugVectorSearch] Result for userId: ${userId}: Context length ${result.context.length}, Sources found: ${result.sources.length}`);
    
    // The console logs within generateContextFromPinecone will provide the detailed debug output.
    // This endpoint returns the structured result.
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    logger.error('[DebugVectorSearch] Error:', error);
    let errorMessage = 'An error occurred during the debug vector search.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
