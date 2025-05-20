// Centralized text chunking utility for all ingestion endpoints (PDF, web, FAQ, etc).
// Provides sentence-aware and word-based chunking with overlap for context preservation.
//
// Used by: /upload/pdf, /fetch-url, and any endpoint needing chunked text for embedding.

export function chunkText(text: string, chunkSize: number = 250, overlap: number = 50): string[] {
  if (!text) return [];
  // Try to split by sentences if possible
  let sentences = text.match(/[^.!?\n]+[.!?\n]+/g);
  // If sentence splitting fails or results in a single chunk, fall back to word-based chunking
  if (!sentences || sentences.length === 1) {
    const words = text.split(/\s+/);
    if (chunkSize <= 0) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk);
      if (i + chunkSize >= words.length) break;
    }
    return chunks;
  }
  const chunks: string[] = [];
  let current: string[] = [];
  let wordCount = 0;
  let i = 0;
  while (i < sentences.length) {
    const sentence = sentences[i];
    const words = sentence.split(/\s+/);
    if (wordCount + words.length > chunkSize && current.length > 0) {
      chunks.push(current.join(' '));
      // Overlap
      const overlapWords = current.join(' ').split(/\s+/).slice(-overlap);
      current = [overlapWords.join(' ')];
      wordCount = overlapWords.length;
    }
    current.push(sentence);
    wordCount += words.length;
    i++;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
} 