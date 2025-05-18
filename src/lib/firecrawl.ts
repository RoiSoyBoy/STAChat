import axios from 'axios';

interface FirecrawlCloudScrapeResult {
  content: string | null; // Text content
  markdown: string | null; // Markdown content
  html: string | null; // HTML content
  metadata: Record<string, any>;
  // Add other fields like title, linksOnPage if needed based on actual API response
}

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v0/scrape';

export async function fetchFirecrawlData(url: string): Promise<FirecrawlCloudScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    console.error('ERROR: FIRECRAWL_API_KEY environment variable is not defined.');
    throw new Error('CRITICAL: FIRECRAWL_API_KEY is missing. Please set it in your environment variables.');
  } else {
    console.log('Firecrawl API Key loaded successfully (first few chars):', apiKey.substring(0, 5) + '...');
  }

  const requestBody = {
    url: url,
    pageOptions: {
      // onlyMainContent: true, // We'll handle main content extraction ourselves from the full HTML
      includeHtml: true,    // Request the full HTML
      // removeSelectors can be kept minimal or empty if we are processing full HTML ourselves
      removeSelectors: [ 
        "script", "style", "noscript", "iframe" // Still good to remove these early
      ],
    },
    crawlerOptions: {
      maxDepth: 0,
      // Attempt to ensure only the specified URL's content is focused on,
      // though this usually pertains to what links to follow when crawling.
      // Regex escape the URL and match it exactly, allowing for query strings or hash.
      includes: [url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(\\?.*|#.*)?$"],
      // excludes: [] // Could be used if specific sub-paths of the main URL need to be ignored
    }
  };

  console.log(`Fetching Firecrawl data for URL: ${url} with options: ${JSON.stringify(requestBody)}`);

  try {
    const response = await axios.post<{ data: FirecrawlCloudScrapeResult }>(
      FIRECRAWL_API_URL,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data || typeof response.data.data !== 'object' || response.data.data === null) {
      console.error("Invalid response structure from Firecrawl Cloud API:", response.data);
      throw new Error("Invalid response structure from Firecrawl Cloud API");
    }
    
    console.log('Firecrawl data fetched successfully for URL:', url);
    return response.data.data;
  } catch (error: any) {
    console.error("Error calling Firecrawl Cloud API for URL:", url);
    if (error.response) {
      console.error('Firecrawl API Error Status:', error.response.status);
      console.error('Firecrawl API Error Data:', error.response.data);
      if (error.response.status === 401) {
        console.error('FIRECRAWL API returned 401 Unauthorized. Check your FIRECRAWL_API_KEY.');
      }
    } else {
      console.error('Firecrawl API Error Message:', error.message);
    }
    const errorMessage = error.response?.data?.error || error.message || 'Unknown Firecrawl API error';
    throw new Error(`Firecrawl fetch failed: ${errorMessage}`);
  }
}
