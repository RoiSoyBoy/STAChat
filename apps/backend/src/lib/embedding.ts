import { OpenAI } from 'openai';
import { OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_DIMENSIONS } from 'shared';

// Instantiate OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to generate embeddings using OpenAI API
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    console.warn('generateEmbeddings called with empty or invalid input.');
    return [];
  }

  // OpenAI recommends replacing newlines with spaces for better results
  const processedTexts = texts.map(text => text.replace(/\n/g, ' '));

  try {
    const response = await openai.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL, // Standard 1536-dim model
      input: processedTexts,
    });

    // Ensure the response structure is as expected
    if (!response || !response.data || response.data.length !== texts.length) {
      console.error('Unexpected response structure from OpenAI embeddings API:', response);
      throw new Error('Invalid response structure from OpenAI embeddings API.');
    }

    // Extract embeddings from the response
    const embeddings = response.data.map(item => item.embedding);

    // Validate embedding dimensions (optional but good practice)
    if (embeddings.some(e => e.length !== OPENAI_EMBEDDING_DIMENSIONS)) {
        console.error('Embeddings received with incorrect dimensions.');
        throw new Error('Embeddings dimension mismatch.');
    }


    return embeddings;
  } catch (error: any) {
    console.error('Error generating embeddings with OpenAI:', error);
    // Rethrow or handle as appropriate for your application
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}
