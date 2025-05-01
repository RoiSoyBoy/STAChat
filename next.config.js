/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:3000 http://localhost:3001; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://localhost:3000 http://localhost:3001; connect-src 'self' http://localhost:3000 http://localhost:3001; font-src 'self' data:;"
          }
        ],
      },
    ];
  },
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig 