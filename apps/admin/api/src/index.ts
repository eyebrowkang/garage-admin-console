import path from 'path';
import express from 'express';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { app } from './app.js';

// Run database migrations before starting the server
await runMigrations();
logger.info('Database migrations applied');

// Serve static frontend files when STATIC_DIR is configured (Docker / production)
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const resolved = path.resolve(staticDir);

  // Serve only S3 Browser remote assets in combined deployment. Standalone S3
  // routes must not leak a second SPA shell under the Admin host.
  const s3BrowserDir = process.env.S3_BROWSER_STATIC_DIR;
  if (s3BrowserDir) {
    const s3BrowserStatic = express.static(path.resolve(s3BrowserDir), {
      index: false,
      redirect: false,
    });

    app.use(
      '/s3-browser',
      (req, res, next) => {
        s3BrowserStatic(req, res, (error) => {
          if (error) {
            next(error);
            return;
          }

          if (!res.headersSent) {
            res.status(404).end();
          }
        });
      },
    );
  }

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
