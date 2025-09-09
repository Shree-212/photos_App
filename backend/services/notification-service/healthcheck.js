#!/usr/bin/env node

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3004,
  path: '/health',
  timeout: 2000
};

const req = http.request(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on('error', () => {
  process.exit(1);
});

req.setTimeout(2000, () => {
  req.destroy();
  process.exit(1);
});

req.end();
