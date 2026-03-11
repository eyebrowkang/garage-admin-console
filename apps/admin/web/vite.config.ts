import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'path';
import { resolveS3BrowserRemoteEntry } from './src/lib/mf-config';

const s3BrowserRemoteEntry = resolveS3BrowserRemoteEntry(process.env);

export default defineConfig({
  plugins: [
    federation({
      name: 'admin_console',
      dts: false,
      remotes: {
        s3_browser: {
          type: 'module',
          name: 's3_browser',
          entry: s3BrowserRemoteEntry,
          entryGlobalName: 's3_browser',
          shareScope: 'default',
        },
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          // Skip MF internal modules to avoid circular chunk warnings
          if (id.includes('@module-federation') || id.includes('__loadShare__')) {
            return undefined;
          }
          // Only split echarts (large); MF handles shared deps (react, router, query)
          if (id.includes('echarts')) {
            return 'vendor-echarts';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy S3 Browser MF remote assets through admin dev server to avoid CORS.
      // No rewrite — s3-browser uses base='/s3-browser/' so it expects the prefix.
      '/s3-browser': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
      // Proxy S3 Browser API so embedded ObjectBrowser calls stay same-origin
      '/s3-api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3-api/, '/api'),
      },
    },
  },
});
