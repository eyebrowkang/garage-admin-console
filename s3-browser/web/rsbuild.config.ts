import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * @s3-browser/web — Rsbuild + React 19 + Module Federation 2.0 (Remote).
 *
 * MF surface:
 *   - `./FileBrowser`  — plain React component, the primary embedded surface.
 *   - `./export-app`   — Bridge-wrapped full app, for hosts that want the
 *                        entire standalone UI mounted as a remote.
 *
 * Shared graph: only React + ReactDOM are singletons. @garage/ui and
 * @garage/tokens are intentionally NOT shared at runtime (each app bundles
 * its own copy so a host can swap design-token versions independently).
 */
export default defineConfig(({ command }) => ({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 's3Browser',
      filename: 'remoteEntry.js',
      exposes: {
        './export-app': './src/export-app.tsx',
        './FileBrowser': './src/export-file-browser.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19' },
        'react-dom': { singleton: true, requiredVersion: '^19' },
      },
      dts: command === 'build',
      bridge: { enableBridgeRouter: false },
    }),
  ],
  source: {
    entry: { index: './src/main.tsx' },
    alias: {
      '@': path.resolve(configDir, './src'),
    },
  },
  server: {
    port: 5174,
    // historyApiFallback: true intercepts ALL 404s (including .js/.css files) in
    // Rsbuild 2.x because the middleware runs before the in-memory file server,
    // causing remoteEntry.js and CSS async chunks to be served as index.html.
    // Explicit rewrites limit fallback to the actual SPA route patterns only.
    historyApiFallback: {
      rewrites: [
        { from: /^\/$/, to: '/index.html' },
        { from: /^\/connections/, to: '/index.html' },
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
  dev: {
    // Must be a full origin (not '/') so that __webpack_public_path__ carries
    // the correct host:port when remoteEntry.js is loaded cross-origin from the
    // Admin Console (port 5173). With '/' the public path resolves against the
    // *current page* origin, causing CSS/JS chunks to be fetched from 5173
    // instead of 5174.
    //
    // Override with S3_BROWSER_DEV_ORIGIN for LAN dev
    // (e.g. S3_BROWSER_DEV_ORIGIN=http://192.168.1.10:5174).
    assetPrefix: process.env.S3_BROWSER_DEV_ORIGIN ?? 'http://localhost:5174',
  },
  html: {
    title: 'S3 Browser',
    favicon: './public/favicon.ico',
    tags: [
      {
        tag: 'link',
        attrs: {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/s3-browser-logo.svg',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'alternate icon',
          type: 'image/x-icon',
          href: '/favicon.ico',
        },
      },
      {
        tag: 'link',
        attrs: {
          rel: 'apple-touch-icon',
          href: '/apple-touch-icon.png',
        },
      },
    ],
  },
  output: {
    assetPrefix: 'auto',
    distPath: { root: 'dist' },
  },
}));
