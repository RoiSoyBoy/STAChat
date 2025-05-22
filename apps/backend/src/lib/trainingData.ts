import * as fs from 'node:fs/promises';
// TrainingDataSource will be imported if needed, but this file primarily processes data
// into Q&A pairs, not into the TrainingDataSource format.

// The return type Promise<any> is kept from the original function.
// Ideally, this would be Promise<{ question: string; answer: string; }[]>
export async function processTrainingDataFromPath(filepath: string): Promise<any> {
  try {
    const text = await fs.readFile(filepath, 'utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    
    // Basic validation
    if (lines.length === 0) {
      throw new Error('הקובץ ריק');
    }

    // Process each line as a Q&A pair
    const pairs = lines.map(line => {
      const [question, answer] = line.split('|').map(s => s.trim());
      if (!question || !answer) {
        throw new Error('פורמט לא תקין - כל שורה חייבת להכיל שאלה ותשובה מופרדות ב-|');
      }
      return { question, answer };
    });

    return pairs;
  } catch (error) {
    console.error('Error processing training data from path:', error);
    // It's good practice to wrap the original error or rethrow a new one with context
    if (error instanceof Error) {
      throw new Error(`Failed to process training data from ${filepath}: ${error.message}`);
    }
    throw new Error(`Failed to process training data from ${filepath} due to an unknown error.`);
  }
}
