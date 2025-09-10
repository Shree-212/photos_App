const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const next = require('next');
const cors = require('cors');

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 80;
const nextApp = next({ dev, hostname: 'localhost', port });
const handle = nextApp.getRequestHandler();

const app = express();

// CORS middleware
app.use(cors({
  origin: true,
  credentials: true
}));

// API proxy routes
app.use('/api/auth', createProxyMiddleware({
  target: 'http://auth-service.task-manager.svc.cluster.local:80',
  changeOrigin: true,
  pathRewrite: {
    '^/api/auth': '/auth'
  },
  timeout: 10000
}));

app.use('/api/tasks', createProxyMiddleware({
  target: 'http://task-service.task-manager.svc.cluster.local:80',
  changeOrigin: true,
  pathRewrite: {
    '^/api/tasks': '/tasks'
  },
  timeout: 10000
}));

app.use('/api/media', createProxyMiddleware({
  target: 'http://media-service.task-manager.svc.cluster.local:80',
  changeOrigin: true,
  pathRewrite: {
    '^/api/media': '/media'
  },
  timeout: 10000
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'frontend-proxy'
  });
});

// Handle all other requests with Next.js
app.all('*', (req, res) => {
  return handle(req, res);
});

nextApp.prepare().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Frontend with API proxy running on port ${port}`);
    console.log(`Server ready at http://0.0.0.0:${port}`);
  });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
