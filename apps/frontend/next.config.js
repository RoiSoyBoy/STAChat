/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // Proxy to Backend
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Fix for issues with certain packages in Next.js 13+ App Router
    if (!isServer) {
      // Ensures these packages are treated as client-side components
    }
    // Important: return the modified config
    return config;
  },
  images: {
    domains: ['firebasestorage.googleapis.com'], // Add other domains if needed
  },
  // If you were using i18n with next-i18next and page router
  // i18n: {
  //   locales: ['en', 'he'],
  //   defaultLocale: 'he',
  // },
};

module.exports = nextConfig;
