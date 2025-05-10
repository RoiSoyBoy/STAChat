import { generateEmbeddings } from '@/ingestion/shared/embedding';

describe('generateEmbeddings', () => {
  it('returns an array of embeddings for each input text', async () => {
    // Mock OpenAI inside the function if possible, or just check shape
    const texts = ['foo', 'bar', 'baz'];
    const embeddings = await generateEmbeddings(texts);
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(texts.length);
    embeddings.forEach(vec => {
      expect(Array.isArray(vec)).toBe(true);
      expect(typeof vec[0]).toBe('number');
    });
  });

  it('returns empty array for empty input', async () => {
    const embeddings = await generateEmbeddings([]);
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(0);
  });

  it('returns a single embedding for one text', async () => {
    const embeddings = await generateEmbeddings(['hello']);
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(1);
    expect(Array.isArray(embeddings[0])).toBe(true);
  });

  it('handles OpenAI error gracefully (returns zero vector)', async () => {
    // Simulate error by passing a string that triggers an error (if possible)
    // Or mock OpenAI to throw
    const original = console.error;
    console.error = jest.fn();
    const embeddings = await generateEmbeddings(['__ERROR__']);
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(1);
    expect(Array.isArray(embeddings[0])).toBe(true);
    // Should be all zeros or fallback value
    expect(embeddings[0].every((v: number) => v === 0)).toBe(true);
    console.error = original;
  });
}); 