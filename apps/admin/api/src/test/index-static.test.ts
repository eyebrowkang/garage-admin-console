import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');
const START_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;

type StartedServer = {
  adminStaticDir: string;
  child: ChildProcess;
  remoteEntryPath: string;
  s3StaticDir: string;
  url: string;
};

const runningChildren = new Set<ChildProcess>();

async function allocatePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate a test port.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function fetchWithRetry(url: string): Promise<Response> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      return await fetch(url, { redirect: 'manual' });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error(`Timed out waiting for server ${url}: ${String(lastError)}`);
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
    }),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
        resolve();
      }, STOP_TIMEOUT_MS);
    }),
  ]);
}

async function startServer(): Promise<StartedServer> {
  const port = await allocatePort();
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'garage-admin-index-static-'));
  const adminStaticDir = path.join(tmpRoot, 'admin-static');
  const s3StaticDir = path.join(tmpRoot, 's3-static');
  const dataDir = path.join(tmpRoot, 'data');
  const remoteEntryPath = path.join(s3StaticDir, 'remoteEntry.js');

  await Promise.all([mkdir(adminStaticDir), mkdir(s3StaticDir), mkdir(dataDir)]);
  await Promise.all([
    writeFile(path.join(adminStaticDir, 'index.html'), '<html><body>admin-shell</body></html>'),
    writeFile(path.join(s3StaticDir, 'index.html'), '<html><body>s3-shell</body></html>'),
    writeFile(remoteEntryPath, 'console.log("remote entry");'),
  ]);

  const child = spawn('node', ['--import', 'tsx', './src/index.ts'], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      ADMIN_PASSWORD: 'test-admin-password',
      DATA_DIR: dataDir,
      DOTENV_CONFIG_PATH: '/dev/null',
      ENCRYPTION_KEY: '01234567890123456789012345678901',
      JWT_SECRET: 'test-jwt-secret',
      LOG_LEVEL: 'silent',
      MORGAN_FORMAT: 'off',
      PORT: String(port),
      S3_BROWSER_STATIC_DIR: s3StaticDir,
      STATIC_DIR: adminStaticDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningChildren.add(child);

  child.stderr?.setEncoding('utf8');
  child.stdout?.setEncoding('utf8');

  await fetchWithRetry(`http://127.0.0.1:${port}/api/health`);

  return {
    adminStaticDir,
    child,
    remoteEntryPath,
    s3StaticDir,
    url: `http://127.0.0.1:${port}`,
  };
}

afterEach(async () => {
  await Promise.all(Array.from(runningChildren, async (child) => stopChild(child)));
  runningChildren.clear();
});

describe('admin production static routing', () => {
  it('serves only MF assets from /s3-browser while keeping the admin shell at /', async () => {
    const server = await startServer();

    const adminShell = await fetch(`${server.url}/`, {
      headers: { Accept: 'text/html' },
    });
    const remoteEntry = await fetch(`${server.url}/s3-browser/remoteEntry.js`);
    const s3Root = await fetch(`${server.url}/s3-browser/`, {
      headers: { Accept: 'text/html' },
    });
    const s3StandaloneRoute = await fetch(`${server.url}/s3-browser/connections`, {
      headers: { Accept: 'text/html' },
    });

    expect(adminShell.status).toBe(200);
    await expect(adminShell.text()).resolves.toContain('admin-shell');

    expect(remoteEntry.status).toBe(200);
    await expect(remoteEntry.text()).resolves.toContain('remote entry');

    expect(s3Root.status).toBe(404);
    await expect(s3Root.text()).resolves.toBe('');
    expect(s3StandaloneRoute.status).toBe(404);
    await expect(s3StandaloneRoute.text()).resolves.toBe('');
  });
});
