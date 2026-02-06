import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('echarts')) {
            return 'vendor-echarts';
          }

          if (id.includes('react-router')) {
            return 'vendor-router';
          }

          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }

          if (id.includes('react') || id.includes('scheduler')) {
            return 'vendor-react';
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
        rewrite: (pathValue) => pathValue.replace(/^\/api/, ''),
      },
    },
  },
});
