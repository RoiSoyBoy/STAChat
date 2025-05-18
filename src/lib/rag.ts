import OpenAI from 'openai';
import { findMostSimilarChunks } from './vectorSearch';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getRagAnswer(userQuestion: string, topN = 5) {
  const topChunks = await findMostSimilarChunks(userQuestion, topN);
  const context = topChunks.map(chunk => chunk.text).join('\n---\n');

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

export async function firecrawlSearch(query: string, limit = 5, lang = 'en', country = 'us') {
  const res = await axios.post('http://localhost:3000/firecrawl_search', {
    query,
    limit,
    lang,
    country,
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
    },
  });
  return res.data;
}

export async function firecrawlCrawl(url: string, maxDepth = 2, limit = 100) {
  const res = await axios.post('http://localhost:3000/firecrawl_crawl', {
    url,
    maxDepth,
    limit,
    allowExternalLinks: false,
    deduplicateSimilarURLs: true,
  });
  return res.data;
}

export async function firecrawlScrape(url: string) {
  const res = await axios.post('http://localhost:3000/firecrawl_scrape', {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: 1000,
    timeout: 30000,
    mobile: false,
    includeTags: ['article', 'main'],
    excludeTags: ['nav', 'footer'],
    skipTlsVerification: false,
  });
  return res.data;
}

export async function firecrawlBatchScrape(urls: string[]) {
  const res = await axios.post('http://localhost:3000/firecrawl_batch_scrape', {
    urls,
    options: {
      formats: ['markdown'],
      onlyMainContent: true,
    },
  });
  return res.data;
} 