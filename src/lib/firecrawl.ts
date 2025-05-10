import axios from 'axios';

export interface FirecrawlContent {
  title: string;
  url: string;
  content: Array<{ heading: string; text: string; children?: any[] }>;
}

export async function fetchFirecrawlData(url: string): Promise<FirecrawlContent> {
  const response = await axios.post('http://localhost:3000/crawl', { url });
  return response.data;
} 