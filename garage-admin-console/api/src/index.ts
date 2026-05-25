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

      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
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

// Run database migrations before starting the server
await runMigrations();
logger.info('Database migrations applied');

mountS3BrowserProxy();

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
