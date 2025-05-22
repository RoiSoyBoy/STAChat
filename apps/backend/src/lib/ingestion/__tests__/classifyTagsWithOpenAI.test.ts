import 'openai/shims/node'; // Add Node fetch shim for OpenAI library
import { classifyTagsWithOpenAI } from '../classifyTagsWithOpenAI';

describe('classifyTagsWithOpenAI', () => {
  it('returns an array of tags for a given text', async () => {
    // This test assumes OpenAI is mocked or returns a default value
    const tags = await classifyTagsWithOpenAI('This is a test document about pizza and delivery.');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
    tags.forEach(tag => expect(typeof tag).toBe('string'));
  });

  it('returns fallback tags for empty input', async () => {
    const tags = await classifyTagsWithOpenAI('');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('general');
  });

  it('returns fallback tags for invalid input', async () => {
    const tags = await classifyTagsWithOpenAI('!@#$%^&*()');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('general');
  });

  it('handles OpenAI error gracefully (returns fallback)', async () => {
    const original = console.error;
    console.error = jest.fn();
    const tags = await classifyTagsWithOpenAI('__ERROR__');
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toContain('general');
    console.error = original;
  });
});
