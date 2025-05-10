import { chunkText } from '@/ingestion/shared/chunkText';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns the whole text as one chunk if short', () => {
    const text = 'Hello world.';
    expect(chunkText(text, 100)).toEqual([text]);
  });

  it('splits long text into multiple chunks', () => {
    const text = Array(300).fill('word').join(' ');
    const chunks = chunkText(text, 100, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toContain('word');
  });

  it('applies overlap between chunks', () => {
    const text = Array(250).fill('foo').join(' ');
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // The last 20 words of the first chunk should be the first 20 of the second
    const firstChunkWords = chunks[0].split(' ');
    const secondChunkWords = chunks[1].split(' ');
    expect(firstChunkWords.slice(-20)).toEqual(secondChunkWords.slice(0, 20));
  });

  it('handles non-sentence text', () => {
    const text = 'word '.repeat(120).trim();
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles very large input efficiently', () => {
    const text = 'foo '.repeat(10000).trim();
    const chunks = chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles overlap greater than chunk size', () => {
    const text = 'bar '.repeat(60).trim();
    const chunks = chunkText(text, 20, 30);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles zero or negative chunk size gracefully', () => {
    const text = 'baz '.repeat(10).trim();
    expect(chunkText(text, 0)).toEqual([text]);
    expect(chunkText(text, -5)).toEqual([text]);
  });
}); 