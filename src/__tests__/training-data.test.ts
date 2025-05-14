import { processTrainingData } from '@/lib/training-data';
import '@testing-library/jest-dom';

// Helper to create a mock File object with a .text() method
const createMockFile = (content: string, name: string, type: string): File => {
  const blob = new Blob([content], { type });
  // Add the text method manually as it might not exist in JSDOM/Node File
  (blob as any).text = () => Promise.resolve(content);
  // Add other File properties if needed by the function
  (blob as any).name = name;
  (blob as any).lastModified = Date.now();
  return blob as File;
};

describe('Training Data Processing (Local Function)', () => {

  it('parses valid Q&A pairs from file content', async () => {
    const fileContent = 'What is your name?|My name is Bot.\nHow old are you?|I am AI.';
    const file = createMockFile(fileContent, 'qa.txt', 'text/plain');

    const result = await processTrainingData(file);

    expect(result).toEqual([
      { question: 'What is your name?', answer: 'My name is Bot.' },
      { question: 'How old are you?', answer: 'I am AI.' },
    ]);
  });

  it('throws error for empty file content', async () => {
    const file = createMockFile('', 'empty.txt', 'text/plain');
    await expect(processTrainingData(file)).rejects.toThrow('הקובץ ריק');
  });

  it('throws error for invalid format (missing pipe)', async () => {
    const fileContent = 'Just a question';
    const file = createMockFile(fileContent, 'invalid.txt', 'text/plain');
    await expect(processTrainingData(file)).rejects.toThrow('פורמט לא תקין');
  });

   it('throws error for invalid format (missing answer)', async () => {
    const fileContent = 'Question?|';
    const file = createMockFile(fileContent, 'invalid2.txt', 'text/plain');
    await expect(processTrainingData(file)).rejects.toThrow('פורמט לא תקין');
  });

  it('throws error for invalid format (missing question)', async () => {
    const fileContent = '|Answer';
    const file = createMockFile(fileContent, 'invalid3.txt', 'text/plain');
    await expect(processTrainingData(file)).rejects.toThrow('פורמט לא תקין');
  });

  it('handles file read error (mocked)', async () => {
    const file = createMockFile('', 'error.txt', 'text/plain');
    // Mock the text() method to throw an error
    (file as any).text = () => Promise.reject(new Error('Failed to read file'));

    await expect(processTrainingData(file)).rejects.toThrow('Failed to read file');
  });

});
