/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    // Force new build ID to bust cache
    return `build-${Date.now()}`;
  },
  env: {
    API_BASE_URL: process.env.API_BASE_URL || '',
  },
  // Configure for large file uploads
  experimental: {
    isrMemoryCacheSize: 0, // Disable ISR cache for large files
  },
  // Increase body size limits for file uploads
  serverRuntimeConfig: {
    // Will only be available on the server side
    bodySizeLimit: '600mb',
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'http://auth-service.task-manager.svc.cluster.local:80/auth/:path*',
      },
      {
        source: '/api/albums/:path*',
        destination: 'http://task-service.task-manager.svc.cluster.local:80/albums/:path*',
      },
      {
        source: '/api/media/:path*',
        destination: 'http://media-service.task-manager.svc.cluster.local:80/media/:path*',
      },
      {
        source: '/api/health',
        destination: 'http://auth-service.task-manager.svc.cluster.local:80/health',
      },
    ];
  },
  // Optimize for production
  swcMinify: true,
  images: {
    domains: ['storage.googleapis.com', 'localhost'],
    formats: ['image/webp', 'image/avif'],
  },
  // Security headers with cache busting
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
