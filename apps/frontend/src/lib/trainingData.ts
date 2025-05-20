'use client';

export type TrainingDataSource = {
  type: 'pdf' | 'docx' | 'txt';
  content: string;
  filename: string;
};

export async function processTrainingData(file: File): Promise<any> {
  try {
    const text = await file.text();
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
    console.error('Error processing training data:', error);
    throw error;
  }
}

export async function processTrainingDataFromPath(filepath: string): Promise<TrainingDataSource> {
  throw new Error('This function is only available on the server side');
}
