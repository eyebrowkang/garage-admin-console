import path from 'path';
import express from 'express';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { app } from './app.js';

// Serve static frontend files when STATIC_DIR is configured (Docker / production)
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const resolved = path.resolve(staticDir);
  app.use(express.static(resolved));

  // SPA fallback: serve index.html for unmatched GET requests that accept HTML
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(path.join(resolved, 'index.html'));
    } else {
      next();
    }
  });
}

const PORT = env.port;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BFF API running');
});
