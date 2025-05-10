import { useState } from 'react';
import { firecrawlSearch, firecrawlCrawl, firecrawlBatchScrape } from '../../lib/firecrawlTools';

export default function IngestUrlButton() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleIngest = async () => {
    setStatus('Ingesting...');
    try {
      const crawlResult = await firecrawlCrawl(url);
      const urls = crawlResult.urls;
      const batchScrapeResult = await firecrawlBatchScrape(urls);
      if (batchScrapeResult.success) {
        setStatus('Ingestion complete!');
      } else {
        setStatus('Error: ' + (batchScrapeResult.error || 'Unknown error'));
      }
    } catch (err: any) {
      setStatus('Error: ' + err.message);
    }
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="Enter URL to ingest"
        className="border px-2 py-1 rounded w-64"
      />
      <button
        onClick={handleIngest}
        className="ml-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        disabled={!url}
      >
        Ingest URL
      </button>
      {status && <div className="text-sm mt-2">{status}</div>}
    </div>
  );
} 