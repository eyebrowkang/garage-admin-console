import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';

// When running behind admin dev proxy (pnpm dev), MF_PROXY_BASE is set
// so all module URLs use the proxy path prefix, avoiding cross-origin issues.
// Standalone mode (pnpm dev:s3) uses the default base '/'.
const proxyBase = process.env.MF_PROXY_BASE || '/';

export default defineConfig({
  base: proxyBase,
  plugins: [
    federation({
      name: 's3_browser',
      filename: 'remoteEntry.js',
      dts: false,
      exposes: {
        './ObjectBrowser': './src/components/ObjectBrowser.tsx',
        './BucketExplorer': './src/components/BucketExplorer.tsx',
        './S3EmbedProvider': './src/providers/S3EmbedProvider.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^7.0.0' },
        '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
      },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
