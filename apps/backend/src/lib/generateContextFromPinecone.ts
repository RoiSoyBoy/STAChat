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

  console.log(`[generateContextFromPinecone] Parameters: userId='${userId}', question='${question.substring(0, 50)}...', similarityThreshold=${similarityThreshold}, topK=${topK}`);

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  const index = pinecone.index(pineconeIndex).namespace(`user-${userId}`);

  // 2. Perform a single query to fetch a combined set of matches
  // Fetch topK + 5 to have a larger pool, then select the best 'topK' after similarity filtering.
  const pineconeQueryTopK = topK + 5; 
  const queryResp = await index.query({
    vector: embedding,
    topK: pineconeQueryTopK,
    includeMetadata: true,
    // No filter parameter means no metadata filtering is applied
  });
  
  const allMatches: PineconeMatch[] = (queryResp.matches || []) as any;
  console.log(`[generateContextFromPinecone] Pinecone raw query returned ${allMatches.length} matches. Scores: ${allMatches.map(m => m.score.toFixed(4)).join(', ')}`);

  // 3. Filter matches by similarity threshold and select the top 'topK' overall results
  const filteredMatchesByThreshold = allMatches.filter(m => m.score >= similarityThreshold);
  console.log(`[generateContextFromPinecone] After filtering by threshold >= ${similarityThreshold}, ${filteredMatchesByThreshold.length} matches remain. Scores: ${filteredMatchesByThreshold.map(m => m.score.toFixed(4)).join(', ')}`);
  
  // Pinecone returns matches sorted by score, so slicing gets the top ones.
  const finalMatchesToProcess = filteredMatchesByThreshold.slice(0, topK);
  console.log(`[generateContextFromPinecone] After slicing to topK=${topK}, ${finalMatchesToProcess.length} matches selected for context.`);

  console.debug('FINAL MATCH SOURCE TYPES:', finalMatchesToProcess.map(m => m.metadata.sourceType));

  if (finalMatchesToProcess.length === 0) {
    return { context: '', sources: [], citationMap: {} };
  }

  const contextParts: string[] = [];
  const sources: ContextResult['sources'] = [];
  const citationMap: ContextResult['citationMap'] = {};
  let sourceCounter = 0;
  let qaHeaderAdded = false;
  let chunksHeaderAdded = false;

  // 4. Process all selected matches
  finalMatchesToProcess.forEach((match) => {
    sourceCounter++;
    
    if (match.metadata.sourceType === 'qa') {
      if (!qaHeaderAdded) {
        contextParts.push("Relevant Q&A Found:");
        qaHeaderAdded = true;
      }
      const label = `Source [${sourceCounter}] - Q&A`;
      contextParts.push(`${label}\nQuestion: "${match.metadata.question}"\nAnswer: "${match.metadata.answer}"`);
      sources.push({
        id: match.id,
        sourceType: 'qa',
        documentName: `Q&A from ${match.metadata.originalSourceUrl || match.metadata.originalFilename || 'source'}`,
        url: match.metadata.originalSourceUrl,
        originalFilename: match.metadata.originalFilename,
        score: match.score,
      });
      citationMap[sourceCounter] = {
        sourceType: 'qa',
        fileName: `Q&A: ${match.metadata.question ? match.metadata.question.substring(0,30) : 'N/A'}... from ${match.metadata.originalFilename || match.metadata.originalSourceUrl || 'unknown source'}`,
        documentName: match.metadata.originalFilename || match.metadata.originalSourceUrl,
        originalFilename: match.metadata.originalFilename,
        url: match.metadata.originalSourceUrl,
      };
    } else {
      // This is a general chunk (PDF, web, xml, google-sheet, etc.)
      if (!chunksHeaderAdded) {
        if (qaHeaderAdded) { // Add a separator if Q&A was already added
          contextParts.push("\nAdditional Context from Documents:");
        } else {
          contextParts.push("Context from Documents:");
        }
        chunksHeaderAdded = true;
      }

      let label = `Source [${sourceCounter}] - `;
      const docName = match.metadata.documentName || match.metadata.originalFilename;
      const sourceIdentifier = docName || match.metadata.url || 'Unknown Source';

      // Generic source‐type labeling for any supported format
      const typeLabel = match.metadata.sourceType
        ? match.metadata.sourceType.toUpperCase()
        : 'UNKNOWN';
      label += `${typeLabel}: ${sourceIdentifier}`;
      
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
      citationMap[sourceCounter] = {
        sourceType: match.metadata.sourceType,
        fileName: docName, // Use the determined document name
        url: match.metadata.url,
        chunkIndex: match.metadata.chunkIndex,
        documentName: match.metadata.documentName, // Keep original if available
        originalFilename: match.metadata.originalFilename, // Keep original if available
      };
    }
  });

  return {
    context: contextParts.join('\n\n'),
    sources,
    citationMap,
  };
}
