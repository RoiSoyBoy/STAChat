/** @jest-environment node */
import { NextRequest } from 'next/server';

// Mock firebase-admin/app to prevent initializeApp from running with bad creds
jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => [true]), // Simulate app already initialized
  initializeApp: jest.fn(),
  cert: jest.fn(),
}));

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { POST as chatHandler } from '@/app/api/chat/route';
import { GET as messagesHandler } from '@/app/api/messages/route';
import '@testing-library/jest-dom';
import { checkRateLimit as mockableCheckRateLimit } from '@/lib/cache'; // Import for mocking

// Mock Firebase Admin
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest.fn(() => ({
              get: jest.fn(() => ({
                docs: [],
              })),
            })),
          })),
        })),
      })),
    })),
  })),
}));

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
});
