import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { POST as chatHandler } from '@/app/api/chat/route';
import { GET as messagesHandler } from '@/app/api/messages/route';
import '@testing-library/jest-dom';

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
jest.mock('@/lib/cache', () => ({
  apiLimiter: jest.fn(() => ({ status: 200 })),
  withCache: jest.fn((_, fn) => fn()),
  CACHE_KEYS: {
    CLIENT_CONTEXT: (id: string) => `client_context_${id}`,
    MESSAGES: (id: string) => `messages_${id}`,
  },
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
      const mockApiLimiter = require('@/lib/cache').apiLimiter as jest.Mock;
      mockApiLimiter.mockReturnValueOnce({ status: 429 });

      const req = mockRequest({ message: 'test', clientId: '123' }, 'valid-token');
      const res = await chatHandler(req);
      expect(res.status).toBe(429);
    });
<<<<<<< HEAD

    it('returns a response and sources for a basic message', async () => {
      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({ message: 'מהן שעות הפתיחה?' }),
      });
      // You may need to mock Firebase Auth and Firestore for this test in a real setup
      const res = await chatHandler(req as any);
      const data = await res.json();
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('sources');
    });
=======
>>>>>>> 502a28d6c8291d45390920c28c5032ac146e2c02
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