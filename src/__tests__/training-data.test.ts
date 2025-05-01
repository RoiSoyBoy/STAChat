import { processTrainingData } from '@/lib/training-data';
import '@testing-library/jest-dom';

describe('Training Data Processing', () => {
  beforeEach(() => {
    // Reset fetch mock
    global.fetch = jest.fn();
  });

  it('processes PDF files', async () => {
    const pdfContent = 'Sample PDF content';
    const file = new File([pdfContent], 'test.pdf', { type: 'application/pdf' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        type: 'pdf',
        filename: 'test.pdf',
        content: 'Sample PDF content',
      }),
    });

    const result = await processTrainingData(file);
    expect(result.type).toBe('pdf');
    expect(result.filename).toBe('test.pdf');
    expect(result.content).toBeDefined();

    // Verify the API was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/process-training-data', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('processes DOCX files', async () => {
    const docxContent = 'Sample DOCX content';
    const file = new File([docxContent], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        type: 'docx',
        filename: 'test.docx',
        content: 'Sample DOCX content',
      }),
    });

    const result = await processTrainingData(file);
    expect(result.type).toBe('docx');
    expect(result.filename).toBe('test.docx');
    expect(result.content).toBeDefined();
  });

  it('processes TXT files', async () => {
    const txtContent = 'Sample TXT content';
    const file = new File([txtContent], 'test.txt', { type: 'text/plain' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        type: 'txt',
        filename: 'test.txt',
        content: txtContent,
      }),
    });

    const result = await processTrainingData(file);
    expect(result.type).toBe('txt');
    expect(result.filename).toBe('test.txt');
    expect(result.content).toBe(txtContent);
  });

  it('handles API errors', async () => {
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    await expect(processTrainingData(file)).rejects.toThrow('Failed to process training data');
  });
}); 