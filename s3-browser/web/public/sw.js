/*
 * S3 Browser — service worker (PWA Phase 1, standalone app only).
 *
 * Registered solely by the standalone entry (src/main.tsx); the Module
 * Federation surfaces the Admin host embeds (./FileBrowser, ./export-app) never
 * run this, so embedding never double-registers a SW.
 *
 * Caching contract — mirrors the BFF's Cache-Control discipline:
 *
 *   /api/*                          → network-only (never cache auth/data)
 *   remoteEntry.js, mf-manifest.json → network-only (MF entry must match host)
 *   /static/*                       → cache-first (content-hashed, immutable)
 *   navigations (the app shell)     → network-first, fall back to cached shell
 *   other same-origin GETs          → stale-while-revalidate
 *
 * Bump CACHE_VERSION to force a clean rollover. No skipWaiting()/clients.claim():
 * a new SW takes over only once every tab is closed.
 */
const CACHE_VERSION = 's3-browser-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', () => {
  // No precache: the shell is captured on first navigation (network-first).
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
  return url.pathname.startsWith('/static/');
}

function isMfEntry(url) {
  return url.pathname.endsWith('/remoteEntry.js') || url.pathname.endsWith('/mf-manifest.json');
}

function isNetworkOnly(url) {
  return url.pathname.startsWith('/api/') || isMfEntry(url);
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
