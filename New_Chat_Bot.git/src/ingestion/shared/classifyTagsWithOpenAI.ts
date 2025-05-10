import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  try {
    const completion = await openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that classifies business content.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 50,
      temperature: 0.2,
    });
    const raw = completion.choices[0].message.content || '';
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
  } catch (e) {
    console.error('Error classifying tags:', e);
    return ['general', 'uncategorized'];
  }
} 