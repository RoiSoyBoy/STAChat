import type { NextApiRequest, NextApiResponse } from 'next';
import { firecrawlSearch, firecrawlCrawl, firecrawlBatchScrape } from '../../src/lib/firecrawlTools';
import OpenAI from 'openai';
import { adminDb } from '../../src/lib/firebase-admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getEmbeddings(text: string) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  return res.data[0].embedding;
}

function chunkContent(markdown: string): Array<{ heading: string; text: string }> {
  // Simple chunking: split by headings (##, ###, etc.)
  const lines = markdown.split('\n');
  const chunks: Array<{ heading: string; text: string }> = [];
  let currentHeading = '';
  let currentText = '';
  for (const line of lines) {
    const headingMatch = line.match(/^#+\s*(.*)/);
    if (headingMatch) {
      if (currentText.trim()) {
        chunks.push({ heading: currentHeading, text: currentText.trim() });
      }
      currentHeading = headingMatch[1];
      currentText = '';
    } else {
      currentText += line + '\n';
    }
  }
  if (currentText.trim()) {
    chunks.push({ heading: currentHeading, text: currentText.trim() });
  }
  return chunks;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { url, searchQuery } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    let urls: string[] = [];
    if (searchQuery) {
      const searchResults = await firecrawlSearch(searchQuery);
      urls = searchResults.urls || searchResults.results?.map((r: any) => r.url) || [];
    }
    const crawlResults = await firecrawlCrawl(url);
    const crawledUrls = crawlResults.urls || [];
    urls = Array.from(new Set([...urls, ...crawledUrls]));
    if (urls.length === 0) return res.status(400).json({ error: 'No URLs found to ingest.' });

    const batchScrapeResults = await firecrawlBatchScrape(urls);
    const pages = batchScrapeResults.pages || batchScrapeResults.results || [];
    const results: Array<{ url: string; chunkCount: number }> = [];
    for (const page of pages) {
      const markdown = page.markdown || page.content || '';
      const pageUrl = page.url || '';
      const chunks = chunkContent(markdown);
      for (const chunk of chunks) {
        if (!chunk.text.trim()) continue;
        const embedding = await getEmbeddings(chunk.text);
        await adminDb.collection('web_embeddings').add({
          url: pageUrl,
          heading: chunk.heading,
          text: chunk.text,
          embedding,
          createdAt: Date.now(),
        });
      }
      results.push({ url: pageUrl, chunkCount: chunks.length });
    }
    res.status(200).json({ success: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to ingest URL' });
  }
} 