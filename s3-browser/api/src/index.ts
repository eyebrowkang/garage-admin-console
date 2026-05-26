import path from 'path';
import express, { type Express } from 'express';

const truthy = new Set(['1', 'true', 'yes', 'on']);

function isEnabled(value: string | undefined) {
  return value ? truthy.has(value.trim().toLowerCase()) : false;
}

function getPort(defaultPort: number) {
  const portRaw = process.env.PORT ?? String(defaultPort);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer.');
  }
  return port;
}

function mountStaticFrontend(app: Express) {
  const staticDir = process.env.STATIC_DIR;
  if (!staticDir) {
    return;
  }

  const resolved = path.resolve(staticDir);
  const staticCorsOrigin = process.env.STATIC_CORS_ORIGIN?.trim();

  // MF entry files keep stable names but their content changes every release.
  // Serving them with long-term immutable would let upgraded hosts keep
  // requesting chunks that no longer exist on the remote.
  const noStoreFiles = new Set(['index.html', 'mf-manifest.json', 'remoteEntry.js']);

  app.use(
    express.static(resolved, {
      setHeaders: (res, filePath) => {
        if (staticCorsOrigin) {
          res.setHeader('Access-Control-Allow-Origin', staticCorsOrigin);
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }

        if (noStoreFiles.has(path.basename(filePath))) {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA fallback: only browser navigations should receive index.html. Missing
  // JS/CSS chunks must stay 404 so MF asset problems are visible.
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html') && !path.extname(req.path)) {
      res.sendFile(path.join(resolved, 'index.html'));
    } else {
      next();
    }
  });
}

if (isEnabled(process.env.S3_BROWSER_STATIC_ONLY)) {
  const app = express();

  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ status: 'ok', mode: 'static', timestamp: new Date() });
  });

  mountStaticFrontend(app);

  const port = getPort(3002);
  app.listen(port, () => {
    console.log(`S3 Browser static server running on ${port}`);
  });
} else {
  const [{ env }, { logger }, { runMigrations }, { app }] = await Promise.all([
    import('./config/env.js'),
    import('./logger.js'),
    import('./db/migrate.js'),
    import('./app.js'),
  ]);

  // Run database migrations before starting the server
  await runMigrations();
  logger.info('Database migrations applied');

  mountStaticFrontend(app);

  const PORT = env.port;
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'BFF API running');
  });
}
