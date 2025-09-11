/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'http://auth-service.task-manager.svc.cluster.local:80/auth/:path*',
      },
      {
        source: '/api/tasks/:path*',
        destination: 'http://task-service.task-manager.svc.cluster.local:80/tasks/:path*',
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
  // Security headers
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
        ],
      },
    ];
  },
}

module.exports = nextConfig
