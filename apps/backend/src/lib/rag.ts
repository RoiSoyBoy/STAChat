import OpenAI from 'openai';
import { findMostSimilarChunks } from './vectorSearch';
import { WebEmbeddingDoc } from './types'; // Added import
// Removed: import axios from 'axios';
// Added import for firecrawl tools
import { 
  firecrawlSearch, 
  firecrawlCrawl, 
  firecrawlScrape, 
  firecrawlBatchScrape 
} from './firecrawlTools';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getRagAnswer(userQuestion: string, topN = 5) {
  const topChunks = await findMostSimilarChunks(userQuestion, topN);
  const context = topChunks.map((chunk: WebEmbeddingDoc) => chunk.text).join('\n---\n'); // Typed chunk

  const prompt = `
Context:
${context}

User question: ${userQuestion}
Answer in detail using the context above.
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-nano-2025-04-14',
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.choices[0].message.content;
}

// Firecrawl functions have been moved to ./firecrawlTools.ts
// They are still exported from there and can be used by other modules if needed.
// If getRagAnswer or other functions in this file need them, they are available via the import above.
