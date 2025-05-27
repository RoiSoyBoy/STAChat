import { Router, Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { NextRequest, NextResponse } from 'next/server'; // For type hints, though direct use is tricky

import chatRoutes from './chat/chat.routes';
import processPdfRoutes from './process-pdf/route';
import fetchUrlRouter from './fetch-url/route';

// Import handlers from the Next.js-style route files
import * as settingsApi from './settings/route';
import * as uploadApi from './upload/route';
import * as ingestGoogleSheetApi from './ingest-google-sheet/route';

const v1Router = Router();

// Helper to adapt Next.js App Router-style handlers to Express
const adaptHandler = (handler: (req: NextRequest | Request | any) => Promise<NextResponse>) => {
  return async (expressReq: ExpressRequest, expressRes: ExpressResponse, next: NextFunction) => {
    try {
      // Create a mock NextRequest-like object that wraps the Express req
      const mockNextRequest = {
        headers: {
          get: (key: string): string | null => {
            const headerValue = expressReq.headers[key.toLowerCase()];
            if (Array.isArray(headerValue)) {
              return headerValue.join(', '); // Or handle as appropriate
            }
            return headerValue || null;
          },
          forEach: (callback: (value: string, key: string) => void): void => {
            for (const key in expressReq.headers) {
              if (expressReq.headers.hasOwnProperty(key)) {
                const headerValue = expressReq.headers[key];
                callback(Array.isArray(headerValue) ? headerValue.join(', ') : (headerValue as string), key);
              }
            }
          },
          // Implement other Headers methods if your handlers use them (e.g., has(), entries())
        },
        json: async () => expressReq.body, // Assumes express.json() middleware has parsed the body
        text: async () => Promise.resolve(typeof expressReq.body === 'string' ? expressReq.body : JSON.stringify(expressReq.body)), // Basic text implementation
        url: `${expressReq.protocol}://${expressReq.get('host')}${expressReq.originalUrl}`,
        method: expressReq.method,
        // Note: NextRequest has many other properties like cookies, geo, ip, nextUrl, etc.
        // This mock is minimal and only covers what seems to be used by the current handlers.
      };

      const nextResponse = await handler(mockNextRequest as NextRequest); // Pass the mock
      
      const body = await nextResponse.json(); // Get body from NextResponse
      
      // Copy headers from NextResponse to ExpressResponse
      nextResponse.headers.forEach((value, key) => {
        expressRes.setHeader(key, value);
      });
      
      expressRes.status(nextResponse.status || 200).json(body); // Ensure status is set
    } catch (error) {
      // Pass error to Express's global error handler
      next(error);
    }
  };
};

// Wire up routes
v1Router.use('/chat', chatRoutes); // This seems to be an Express router already
v1Router.use('/process-pdf', processPdfRoutes); // Assuming this is also an Express router
v1Router.use('/fetch-url', fetchUrlRouter); // Assuming this is also an Express router

// Settings routes
if (settingsApi.GET) {
  v1Router.get('/settings', adaptHandler(settingsApi.GET as any));
}
if (settingsApi.POST) {
  v1Router.post('/settings', adaptHandler(settingsApi.POST as any));
}

// Upload route
if (uploadApi.POST) {
  v1Router.post('/upload', adaptHandler(uploadApi.POST as any));
}

// Ingest Google Sheet route
if (ingestGoogleSheetApi.POST) {
  v1Router.post('/ingest-google-sheet', adaptHandler(ingestGoogleSheetApi.POST as any));
}

export default v1Router;
