import path from 'path';
import express from 'express';
import { env } from './config/env.js';
import { app } from './app.js';

// Serve static frontend files when STATIC_DIR is configured
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const resolved = path.resolve(staticDir);
  app.use(express.static(resolved));

  // SPA fallback
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(path.join(resolved, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(env.PORT, () => {
  console.log(`S3 Browser API running on port ${env.PORT}`);
});
