import path from 'path';
import express from 'express';
import { Readable } from 'stream';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { app } from './app.js';

function getS3BrowserProxyTarget() {
  return process.env.S3_BROWSER_MF_PROXY_TARGET?.trim().replace(/\/+$/, '') || null;
}

function getProxyRequestHeaders(req: express.Request) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key.toLowerCase() === 'host') continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  if (req.headers.host) {
    headers.set('x-forwarded-host', req.headers.host);
  }
  headers.set('x-forwarded-proto', req.protocol);

  return headers;
}

function mountS3BrowserProxy() {
  const proxyTarget = getS3BrowserProxyTarget();
  if (!proxyTarget) {
    return;
  }

  app.use('/s3-browser', async (req, res) => {
    const upstreamPath = req.originalUrl.slice('/s3-browser'.length) || '/';
    const targetUrl = new URL(
      `${proxyTarget}${upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`}`,
    );
    const method = req.method ?? 'GET';
    const requestInit: RequestInit & { duplex?: 'half' } = {
      method,
      headers: getProxyRequestHeaders(req),
      redirect: 'manual',
    };

    if (method !== 'GET' && method !== 'HEAD') {
      requestInit.body = req as unknown as BodyInit;
      requestInit.duplex = 'half';
    }

    try {
      const response = await fetch(targetUrl, requestInit);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      res.status(response.status);

      if (method === 'HEAD' || !response.body) {
        res.end();
        return;
      }

      const upstream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
      // pipe() does not forward source errors, so an upstream failure after
      // headers are flushed would otherwise throw as an unhandled 'error'.
      upstream.on('error', (streamError) => {
        logger.warn(
          { error: streamError, target: targetUrl.href },
          'S3 Browser MF proxy stream error',
        );
        res.destroy();
      });
      upstream.pipe(res);
    } catch (error) {
      logger.warn({ error, target: targetUrl.href }, 'S3 Browser MF proxy request failed');
      if (!res.headersSent) {
        res.status(502).json({ error: 'S3 Browser remote is unavailable.' });
      } else {
        res.end();
      }
    }
  });
}

/**
 * All-in-one image: serve the bundled S3 Browser MF remote same-origin from
 * S3_BROWSER_STATIC_DIR, so no separate container or proxy hop is needed. The
 * remote is built with assetPrefix:'auto', so its chunks resolve relative to
 * `/s3-browser/` automatically. Returns true when it mounted.
 */
function mountS3BrowserStatic(): boolean {
  const dir = process.env.S3_BROWSER_STATIC_DIR?.trim();
  if (!dir) return false;
  const resolved = path.resolve(dir);

  app.use(
    '/s3-browser',
    express.static(resolved, {
      setHeaders: (res, filePath) => {
        // The manifest + entry must roll out on deploy; hashed chunks are immutable.
        const base = path.basename(filePath);
        if (base === 'mf-manifest.json' || base === 'remoteEntry.js') {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  logger.info({ dir: resolved }, 'Serving S3 Browser MF remote same-origin at /s3-browser');
  return true;
}

// Run database migrations before starting the server
await runMigrations();
logger.info('Database migrations applied');

// Prefer serving the bundled remote same-origin (all-in-one image); otherwise
// proxy to a separate S3 Browser container (multi-container combined deploy).
if (!mountS3BrowserStatic()) {
  mountS3BrowserProxy();
}

// Serve static frontend files when STATIC_DIR is configured (Docker / production)
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const resolved = path.resolve(staticDir);

  app.get('/runtime-config.js', (_req, res) => {
    const runtimeConfig = {
      s3BrowserMfUrl: process.env.S3_BROWSER_MF_URL?.trim() || undefined,
    };
    const serialized = JSON.stringify(runtimeConfig).replace(/</g, '\\u003c');

    res.type('application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`window.__GARAGE_RUNTIME_CONFIG__ = ${serialized};\n`);
  });

  // index.html, the service worker, and the web manifest must never be cached so
  // new deploys (and SW updates) roll out immediately; every other file is
  // content-hashed by Vite and safe to cache immutably.
  const noStore = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
  app.use(
    express.static(resolved, {
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (base === 'manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
        }
        if (noStore.has(base)) {
          res.setHeader('Cache-Control', 'no-store');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // SPA fallback: serve index.html for browser navigations so client-side
  // routes survive a refresh — INCLUDING routes that contain dots (e.g. a bucket
  // named "my.bucket.com"). Keying off a file extension was wrong: it 404'd
  // those routes to a white screen. Everything here already missed
  // express.static, so serve index.html unless the request is an API call, a
  // Vite hashed asset (/assets), or the federated remote (/s3-browser) — those
  // keep 404ing so a genuinely-missing asset is visible, not masked as HTML.
  app.use((req, res, next) => {
    if (
      req.method === 'GET' &&
      req.accepts('html') &&
      !req.path.startsWith('/api') &&
      !req.path.startsWith('/assets/') &&
      !req.path.startsWith('/s3-browser/')
    ) {
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
