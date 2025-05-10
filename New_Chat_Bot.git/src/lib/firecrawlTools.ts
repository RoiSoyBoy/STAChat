import axios from 'axios';

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