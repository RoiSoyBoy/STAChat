import axios from 'axios';

// Define interface for the actual Cloud API response structure (within the 'data' field)
interface FirecrawlCloudScrapeResult {
  content: string | null; // Content is a string (or null)
  markdown: string | null;
  metadata: Record<string, any>;
  // Add other fields like title, linksOnPage if needed based on actual API response
}

// Comment out or remove the old interface if not used elsewhere
// export interface FirecrawlContent {
//   title: string;
//   url: string;
//   content: Array<{ heading: string; text: string; children?: any[] }>;
// }

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v0/scrape'; // Cloud API endpoint

// Update the function's return type annotation
export async function fetchFirecrawlData(url: string): Promise<FirecrawlCloudScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  if (!apiKey) {
    console.error('ERROR: FIRECRAWL_API_KEY environment variable is not defined.');
    throw new Error('CRITICAL: FIRECRAWL_API_KEY is missing. Please set it in your environment variables.');
  } else {
    console.log('Firecrawl API Key loaded successfully (first few chars):', apiKey.substring(0, 5) + '...');
  }

  console.log(`Fetching Firecrawl data for URL: ${url}`);
  try {
    // Type the expected structure of axios response
    const response = await axios.post<{ data: FirecrawlCloudScrapeResult }>(
      FIRECRAWL_API_URL,
      { url: url }, // Request body remains the same
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`, // Send API key in header
          'Content-Type': 'application/json',
        },
      }
    );

    // Ensure the expected nested structure exists
    if (!response.data || typeof response.data.data !== 'object' || response.data.data === null) {
       console.error("Invalid response structure from Firecrawl Cloud API:", response.data);
       throw new Error("Invalid response structure from Firecrawl Cloud API");
    }
    
    console.log('Firecrawl data fetched successfully for URL:', url);
    // Return the actual data payload
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
