import OpenAI from 'openai';

// Ensure this module is only used on the server-side
if (typeof window !== 'undefined') {
  throw new Error('OpenAI client should only be initialized on the server side.');
}

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY environment variable is not defined.');
  throw new Error('CRITICAL: OPENAI_API_KEY is missing. Please set it in your environment variables.');
} else {
  console.log('OpenAI API Key loaded successfully (first few chars):', apiKey.substring(0, 5) + '...');
}

const openai = new OpenAI({
  apiKey: apiKey,
  // dangerouslyAllowBrowser: true, // Allow in browser-like test environment - Removed due to server-side only enforcement
});

// Centralized utility for classifying text chunks with OpenAI to generate tags.
// Used by all ingestion endpoints to ensure consistent tag generation and normalization.
//
// Used by: /upload/pdf, /fetch-url, and any endpoint needing tags for chunked text.

function normalizeTag(tag: string): string {
  // Lowercase, replace spaces with hyphens, max 3 words
  return tag
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .split('-')
    .slice(0, 3)
    .join('-');
}

export async function classifyTagsWithOpenAI(text: string): Promise<string[]> {
  const prompt = `Analyze this content and return 3-5 concise classification tags in English.\nContent:\n"""${text.slice(0, 2000)}"""\nTags (comma separated):`;
  console.log('Classifying tags with OpenAI for text snippet:', text.substring(0, 50) + '...');
  try {
    const completion = await openai.chat.completions.create({
<<<<<<< HEAD
      model: 'gpt-4.1-nano-2025-04-14', // Consider making the model configurable via env var
=======
      model: 'chatgpt-4o-latest', // Consider making the model configurable via env var
>>>>>>> 9d194f71cdf42ba32f59c9aaaa34ae15fb36543e
      messages: [
        { role: 'system', content: 'You are a helpful assistant that classifies business content.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 50,
      temperature: 0.2,
    });
    const raw = completion.choices[0].message.content || '';
    console.log('OpenAI raw response for tag classification:', raw);
    // Extract tags: split by comma, normalize, filter empty
    let tags = raw
      .replace(/tags\s*[:：]/i, '')
      .split(',')
      .map(t => normalizeTag(t.trim()))
      .filter(Boolean);
    // Remove duplicates
    tags = Array.from(new Set(tags));
    // Validate: 3-5 tags, all are 1-3 words, no empty
    if (tags.length < 3 || tags.length > 5 || tags.some(t => !t || t.split('-').length > 3)) {
      console.warn('Irrelevant or invalid tags from OpenAI:', raw, tags);
      return ['general', 'uncategorized'];
    }
    return tags;
  } catch (e: any) {
    console.error('Error classifying tags with OpenAI:', e.message);
    if (e.status === 401) {
      console.error('OpenAI API returned 401 Unauthorized. Check your API key and organization ID.');
    }
    // Optionally, log more details from the error object if available
    // if (e.response && e.response.data) {
    //   console.error('OpenAI API error details:', e.response.data);
    // }
    return ['general', 'uncategorized'];
  }
}
