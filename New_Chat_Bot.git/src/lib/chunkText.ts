// Splits text into chunks of a specified size (default: 1000 characters)
// For more precise token control, use a tokenizer library (like tiktoken or gpt-3-encoder)
// Adjust chunkSize as needed to control downstream token usage
export function chunkText(text: string, chunkSize = 1000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
} 