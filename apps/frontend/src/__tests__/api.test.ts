/** @jest-environment node */
import { NextRequest } from 'next/server';
import type formidable from 'formidable'; // For formidable.File type
import { POST as pdfUploadHandler } from '@/app/api/upload/pdf/route';

import { getAuth, getFirestore } from '@/lib/firebaseAdmin'; // Corrected import
import { POST as chatHandler } from '@/app/api/chat/route';
import { GET as messagesHandler } from '@/app/api/messages/route';
// import '@testing-library/jest-dom'; // This should be covered by jest.setup.js
import { checkRateLimit as mockableCheckRateLimit } from '@/lib/cache'; // Import for mocking

// Enhanced Firestore Mock for PDF tests (variables remain for the new mock)
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn();
const mockCollectionAdd = jest.fn();
const mockUserUploadsCollection = {
  doc: jest.fn().mockReturnThis(),
  add: mockCollectionAdd,
};

// Mock the entire firebaseAdmin module
jest.mock('@/lib/firebaseAdmin', () => {
  // Define a common structure for the mocked Firestore instance
  // This uses the globally defined mockBatchSet, mockBatchCommit, etc.
  const firestoreMockInstance = {
    collection: jest.fn((collectionName: string) => {
      if (collectionName === 'pdf_uploads') {
        return { add: mockCollectionAdd };
      }
      if (collectionName === 'users') {
        return {
          doc: jest.fn(() => ({
            collection: jest.fn((subCollectionName: string) => {
              if (subCollectionName === 'uploads') {
                return mockUserUploadsCollection;
              }
              if (subCollectionName === 'messages') {
                return {
                  orderBy: jest.fn(() => ({
                    limit: jest.fn(() => ({
                      get: jest.fn(() => ({
                        docs: [], // Default for messages
                      })),
                    })),
                  })),
                };
              }
              return {};
            }),
          })),
        };
      }
      // Fallback for other collections
      return {
        doc: jest.fn().mockReturnThis(),
        collection: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => ({ docs: [] })),
      };
    }),
    batch: jest.fn(() => ({
      set: mockBatchSet,
      commit: mockBatchCommit,
    })),
  };

  return {
    // Mock functions exported by src/lib/firebaseAdmin.ts
    getAuth: jest.fn(() => ({
      verifyIdToken: jest.fn(), // Matches how getAuth().verifyIdToken is called
    })),
    // getFirestore is called directly by tests, so it returns the shared mock instance
    getFirestore: jest.fn(() => firestoreMockInstance),
    // initializeAdminApp is exported, returns a Firestore instance
    initializeAdminApp: jest.fn(() => firestoreMockInstance),
    // adminDb is an exported Firestore instance
    adminDb: firestoreMockInstance,
  };
});

// Mock cache
jest.mock('@/lib/cache', () => {
  const originalCache = jest.requireActual('@/lib/cache');
  return {
    ...originalCache, // Spread original module to keep other exports like CACHE_KEYS
    checkRateLimit: jest.fn(() => true), // Default to not rate-limited
    getRateLimitResponse: jest.fn(() => ({ status: 429, json: () => Promise.resolve({ error: 'Rate limited' }) })),
    withCache: jest.fn((_, fn) => fn()), // Keep existing mock for withCache
    // apiLimiter is not used by chat/route.ts, but keeping if other routes use it.
    // If not, it can be removed.
    apiLimiter: jest.fn(() => ({ status: 200 })),
  };
});

// Mocks for PDF Upload Route
const mockFormidableParse = jest.fn();
jest.mock('formidable', () => {
  return jest.fn(() => ({ // Mocks the formidable constructor
    parse: mockFormidableParse, // Mocks the parse method
  }));
});

const mockPdfParse = jest.fn();
jest.mock('pdf-parse', () => mockPdfParse);

const mockFsReadFile = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Keep other fs parts
  promises: {
    readFile: mockFsReadFile,
  },
}));

const mockChunkText = jest.fn();
jest.mock('@/ingestion/shared/chunkText', () => ({
  chunkText: mockChunkText,
}));

const mockClassifyTags = jest.fn();
jest.mock('@/ingestion/shared/classifyTagsWithOpenAI', () => ({
  classifyTagsWithOpenAI: mockClassifyTags,
}));

const mockGenerateEmbeddings = jest.fn();
jest.mock('@/ingestion/shared/embedding', () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

const mockPineconeUpsert = jest.fn();
const mockPineconeIndex = jest.fn(() => ({
  namespace: jest.fn(() => ({
    upsert: mockPineconeUpsert,
  })),
}));
jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn(() => ({
    index: mockPineconeIndex,
  })),
}));


describe('API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('/api/chat', () => {
    const mockRequest = (body: any, token?: string) => {
      const headers = new Headers();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    };

    it('returns 401 without authorization header', async () => {
      const req = mockRequest({ message: 'test', clientId: '123' });
      const res = await chatHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      (getAuth().verifyIdToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid token'));
      const req = mockRequest({ message: 'test', clientId: '123' }, 'invalid-token');
      const res = await chatHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 without required fields', async () => {
      const req = mockRequest({}, 'valid-token');
      const res = await chatHandler(req);
      expect(res.status).toBe(400);
    });

    it('returns 429 when rate limited', async () => {
      // Ensure the mock is effective by using the imported (and thus mocked) function
      (mockableCheckRateLimit as jest.Mock).mockReturnValueOnce(false); // Simulate rate limit exceeded
      // getRateLimitResponse is globally mocked

      const req = mockRequest({ message: 'test', clientId: '123' }, 'valid-token');
      const res = await chatHandler(req);
      expect(res.status).toBe(429);
    });

    it('returns a response and sources for a basic message', async () => {
      // Use the mockRequest helper which uses NextRequest
      const req = mockRequest(
        { message: 'מהן שעות הפתיחה?', clientId: 'test-client' }, // Added clientId as it's likely required by the handler
        'test-token'
      );
      // Mock verifyIdToken for this specific test if needed
      (getAuth().verifyIdToken as jest.Mock).mockResolvedValueOnce({ uid: 'test-user' });

      // You may need to mock Firestore calls within chatHandler if they occur
      const res = await chatHandler(req);
      const data = await res.json();
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('sources');
    });
  });

  describe('/api/messages', () => {
    const mockRequest = (params: Record<string, string>, token?: string) => {
      const url = new URL('http://localhost/api/messages');
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      const headers = new Headers();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return new NextRequest(url, {
        method: 'GET',
        headers,
      });
    };

    it('returns 401 without authorization header', async () => {
      const req = mockRequest({ clientId: '123' });
      const res = await messagesHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      (getAuth().verifyIdToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid token'));
      const req = mockRequest({ clientId: '123' }, 'invalid-token');
      const res = await messagesHandler(req);
      expect(res.status).toBe(401);
    });

    it('returns 400 without clientId', async () => {
      const req = mockRequest({}, 'valid-token');
      const res = await messagesHandler(req);
      expect(res.status).toBe(400);
    });

    it('returns paginated messages', async () => {
      const mockMessages = [
        { id: '1', content: 'Hello', role: 'user', timestamp: Date.now() },
        { id: '2', content: 'Hi there!', role: 'assistant', timestamp: Date.now() + 1 },
      ];

      const mockFirestore = getFirestore as jest.Mock;
      mockFirestore.mockImplementationOnce(() => ({
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  get: jest.fn(() => ({
                    docs: mockMessages.map(msg => ({
                      id: msg.id,
                      data: () => msg,
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      }));

      const req = mockRequest({ clientId: '123', offset: '0' }, 'valid-token');
      const res = await messagesHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].content).toBe('Hello');
    });
  });

  describe('/api/upload/pdf', () => {
    beforeEach(() => {
      // Clear all mocks defined within this describe block or globally if needed
      mockFormidableParse.mockClear();
      mockPdfParse.mockClear();
      mockFsReadFile.mockClear();
      mockChunkText.mockClear();
      mockClassifyTags.mockClear();
      mockGenerateEmbeddings.mockClear();
      mockPineconeUpsert.mockClear();
      mockPineconeIndex.mockClear();
      mockBatchSet.mockClear();
      mockBatchCommit.mockClear();
      mockCollectionAdd.mockClear();
      
      // Reset environment variables for each test if they are modified
      process.env.PINECONE_API_KEY = 'test-pinecone-key';
      process.env.PINECONE_INDEX = 'test-pinecone-index';
      process.env.OPENAI_API_KEY = 'test-openai-key'; // If used by classify/embedding

      // Reset Firebase Auth mock for verifyIdToken for each test
      (getAuth().verifyIdToken as jest.Mock).mockReset();
    });

    const mockPdfRequest = (token?: string, fileData?: { fields: any; files: any }) => {
      const headers = new Headers();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      headers.set('Content-Type', 'multipart/form-data; boundary=----WebKitFormBoundaryTest');

      const req = new NextRequest('http://localhost/api/upload/pdf', {
        method: 'POST',
        headers,
        body: 'mock form data for test', // Body content isn't deeply processed due to formidable.parse mock
      });

      if (fileData) {
        mockFormidableParse.mockImplementation((_incomingMessage: any, callback: Function) => {
          callback(null, fileData.fields, fileData.files);
        });
      } else {
        // Default mock if no fileData, e.g., for testing "no file" scenarios
        mockFormidableParse.mockImplementation((_incomingMessage: any, callback: Function) => {
          // Simulate formidable finding no files or an error
          callback(null, {}, {}); // No files found
        });
      }
      return req;
    };

    it('should successfully ingest a PDF, process it, and store data', async () => {
      (getAuth().verifyIdToken as jest.Mock).mockResolvedValueOnce({ uid: 'test-user-pdf-123' });

      const mockFileDate = new Date();
      const mockFile: formidable.File = {
        size: 1024,
        filepath: '/tmp/mock-pdf-path',
        originalFilename: 'test-document.pdf',
        newFilename: 'mock-file-on-disk.pdf', // Added newFilename
        mimetype: 'application/pdf',
        mtime: mockFileDate, 
        hash: null,
        hashAlgorithm: false, // Added required hashAlgorithm property
        // The 'length' property mentioned in the error is unusual for formidable.File.
        // If the error "missing ... length" persists, uncomment and set 'length'.
        // length: 1024, 
        toJSON: function() { // Standard method for formidable.File
          return {
            size: this.size,
            filepath: this.filepath,
            originalFilename: this.originalFilename,
            newFilename: this.newFilename,
            mimetype: this.mimetype,
            mtime: this.mtime ?? null, // Ensure mtime is Date or null
            hash: this.hash,
            length: this.size, 
          };
        }
      };
      
      const testFileData = {
        fields: {},
        files: { file: mockFile }, // 'file' matches the expected field name
      };

      mockFsReadFile.mockResolvedValueOnce(Buffer.from('mock PDF content buffer'));
      mockPdfParse.mockResolvedValueOnce({
        numpages: 1,
        numrender: 1,
        info: null,
        metadata: null,
        text: 'This is the extracted PDF text.',
        version: '1.0',
      });
      mockChunkText.mockReturnValueOnce(['This is the extracted PDF text.']); // Single chunk for simplicity
      mockClassifyTags.mockResolvedValueOnce(['pdf', 'test-tag']);
      mockGenerateEmbeddings.mockResolvedValueOnce([[0.01, 0.02, 0.03]]); // One embedding vector for the chunk
      
      // Pinecone and Firestore mocks are set to resolve successfully by default or clear
      mockPineconeUpsert.mockResolvedValueOnce({});
      mockBatchCommit.mockResolvedValueOnce({});
      mockCollectionAdd.mockResolvedValueOnce({}); // For the pdf_uploads collection

      const req = mockPdfRequest('valid-pdf-token', testFileData);
      const response = await pdfUploadHandler(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        chunkCount: 1,
        documentName: 'test-document.pdf',
      });

      expect(mockFsReadFile).toHaveBeenCalledWith('/tmp/mock-pdf-path');
      expect(mockPdfParse).toHaveBeenCalledWith(Buffer.from('mock PDF content buffer'));
      expect(mockChunkText).toHaveBeenCalledWith('This is the extracted PDF text.');
      expect(mockClassifyTags).toHaveBeenCalledWith('This is the extracted PDF text.');
      expect(mockGenerateEmbeddings).toHaveBeenCalledWith(['This is the extracted PDF text.']);
      
      expect(mockPineconeUpsert).toHaveBeenCalledTimes(1);
      expect(mockPineconeUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringContaining('test-user-pdf-123-'),
            values: [0.01, 0.02, 0.03],
            metadata: expect.objectContaining({
              userId: 'test-user-pdf-123',
              documentName: 'test-document.pdf',
              originalFilename: 'test-document.pdf',
              chunkIndex: 0,
              sourceType: 'pdf',
              text: 'This is the extracted PDF text.',
              tags: ['pdf', 'test-tag'],
            }),
          }),
        ])
      );

      expect(mockBatchSet).toHaveBeenCalledTimes(1); // Once per chunk
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
      // Check call to users/{uid}/uploads
      expect(mockUserUploadsCollection.doc).toHaveBeenCalledWith(expect.stringContaining('test-user-pdf-123-'));


      // Check call to pdf_uploads collection
      expect(mockCollectionAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-pdf-123',
          originalFilename: 'test-document.pdf',
          chunkCount: 1,
          sourceType: 'pdf',
        })
      );
    });

    // Add more test cases here:
    // - Auth failure (401)
    // - No file uploaded (400)
    // - Not a PDF / formidable filter fail (400)
    // - PDF parsing errors (empty text, parse fail) (400)
    // - Embedding, Pinecone, Firestore errors (50x)
  });
});
