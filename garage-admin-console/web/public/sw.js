/*
 * Garage Admin Console — service worker (PWA Phase 1).
 *
 * Caching contract — mirrors the BFF's Cache-Control discipline so the SW can
 * NEVER serve a version-skewed Module Federation remote against the host's
 * React singleton (the "Invalid hook call" two-copies failure):
 *
 *   /api/*                               → network-only (never cache auth/data)
 *   /runtime-config.js                   → network-only (runtime env injection)
 *   **\/remoteEntry.js, **\/mf-manifest  → network-only (MF entry must match host)
 *   /assets/*, /s3-browser/static/*      → cache-first (content-hashed, immutable)
 *   navigations (the app shell)          → network-first, fall back to cached shell
 *   other same-origin GETs               → stale-while-revalidate
 *
 * Bump CACHE_VERSION to force a clean rollover. We deliberately do NOT call
 * skipWaiting()/clients.claim(): a new SW takes over only once every tab is
 * closed, so a live page never has its assets swapped mid-session.
 */
const CACHE_VERSION = 'garage-admin-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', () => {
  // No precache: the shell is captured on first navigation (network-first), so a
  // stale index.html is never shipped. Activation waits for tabs to close.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      ),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.includes('/s3-browser/static/');
}

function isMfEntry(url) {
  return url.pathname.endsWith('/remoteEntry.js') || url.pathname.endsWith('/mf-manifest.json');
}

function isNetworkOnly(url) {
  return (
    url.pathname.startsWith('/api/') || url.pathname === '/runtime-config.js' || isMfEntry(url)
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(SHELL_URL, res.clone());
    return res;
  } catch (err) {
    const cached = (await cache.match(SHELL_URL)) || (await cache.match(request));
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnly(url)) return; // fall through to the network

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
