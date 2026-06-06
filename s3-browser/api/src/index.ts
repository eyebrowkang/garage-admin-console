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
  const noStoreFiles = new Set([
    'index.html',
    'mf-manifest.json',
    'remoteEntry.js',
    'sw.js',
    'manifest.webmanifest',
  ]);

  app.use(
    express.static(resolved, {
      setHeaders: (res, filePath) => {
        if (staticCorsOrigin) {
          res.setHeader('Access-Control-Allow-Origin', staticCorsOrigin);
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }

        if (path.basename(filePath) === 'manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
        }

        if (noStoreFiles.has(path.basename(filePath))) {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA fallback: serve index.html for browser navigations so client-side routes
  // survive a refresh — INCLUDING object-key routes that contain dots (e.g.
  // /connections/:id/b/:bucket/report.pdf). Keying off a file extension was
  // wrong — it 404'd those to a white screen, and object keys can even end in
  // .js/.css. Everything here already missed express.static, so serve index.html
  // unless the request is an API call, an Rsbuild asset (/static), or an MF entry
  // file — those keep 404ing so a missing asset isn't masked as HTML.
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      req.accepts('html') &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/static/') &&
      !noStoreFiles.has(path.basename(req.path))
    ) {
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
