import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import { verifyAuthToken, logSuspiciousActivity } from '@/lib/security';

const isLocalhost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';
const PROTECTED_PATHS = [/^\/api\//, /^\/admin(\/|$)/];
const TRUSTED_ORIGINS = [
  'https://your-domain.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === 'development' || isLocalhost(request.nextUrl.hostname);

  // Force HTTPS (skip for dev)
  if (!isDev && request.headers.get('x-forwarded-proto') !== 'https') {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url);
  }

  // Set security headers
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  if (!isDev) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // CORS - more permissive in development
  const origin = request.headers.get('origin');
  if (origin && !isDev && !TRUSTED_ORIGINS.includes(origin)) {
    return new NextResponse('CORS not allowed', { status: 403 });
  }

  // Protect API and admin routes (skip auth for dev)
  // if (!isDev && PROTECTED_PATHS.some((re) => re.test(pathname))) {
  //   const token = request.headers.get('authorization')?.replace('Bearer ', '') || request.cookies.get('token')?.value;
  //   if (!token || !verifyAuthToken(token)) {
  //     logSuspiciousActivity(request, 'Unauthorized access attempt');
  //     return new NextResponse('Unauthorized', { status: 401 });
  //   }
  // }

  // Add CORS headers
  if (isDev) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    response.headers.set('Access-Control-Allow-Origin', origin || '');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 