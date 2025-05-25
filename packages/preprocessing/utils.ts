/**
 * Utility delay function
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean markdown artifacts from text
 */
export function cleanMarkdown(text: string): string {
  return text.replace(/\\([*_~`])/g, '$1');
}

/**
 * Remove duplicate Q&A pairs
 */
export function deduplicateQAs(qas: { question: string; answer: string }[]): { question: string; answer: string }[] {
  const seen = new Set<string>();
  return qas.filter(qa => {
    const key = `${qa.question}|${qa.answer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export {}; // Ensure it's treated as a module
