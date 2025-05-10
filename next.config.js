/** @type {import('next').NextConfig} */
// next.config.js
const nextConfig = {
  experimental: {
    appDirHeaders: true,    // <-- ensure App Router picks up headers()
  },
  output: 'standalone',
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              // Defaults
              `default-src 'self'`,

              // Scripts: Firebase, GTM, Google Analytics, Google APIs, CDN, local dev
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://localhost:* https://www.googletagmanager.com https://www.google-analytics.com https://www.gstatic.com https://www.googleapis.com https://cdn.jsdelivr.net`,

              // Script elements (GTM, Analytics)
              `script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://www.gstatic.com`,
              // Styles: Tailwind, inline, Google Fonts
              `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,

              // Images: data, blob, GTM pixel, Firebase storage, Google Analytics, local dev
              `img-src 'self' data: blob: http://localhost:* https://localhost:* https://www.google.com/images/cleardot.gif https://www.googletagmanager.com https://www.google-analytics.com https://www.gstatic.com https://firebasestorage.googleapis.com`,

              // Connections: Firebase, Firestore, OpenAI, Google APIs, WebSockets, local dev, CDN
              `connect-src 'self' http://localhost:* https://localhost:* https://firestore.googleapis.com https://firebase.googleapis.com https://firebaseinstallations.googleapis.com https://www.googleapis.com https://api.openai.com wss://firestore.googleapis.com wss://*.firebaseio.com https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net`,

              // Fonts: Google Fonts
              `font-src 'self' data: https://fonts.gstatic.com`,

              // Frames: Google OAuth, GTM
              `frame-src 'self' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com`,

              // Disallow everything else
              `object-src 'none'`,
              `base-uri 'self'`,
              `form-action 'self'`,
            ]
              .map((s) => s.trim().replace(/\s+/g, ' '))
              .join('; ')
              .trim()
          },
          { key: 'X-Test-Header', value: 'hello-world' }
        ]
      }
    ];
  },

  reactStrictMode: true,
  swcMinify: true,
};

module.exports = nextConfig;
