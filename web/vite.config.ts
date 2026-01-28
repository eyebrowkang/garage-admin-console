import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (pathValue) => pathValue.replace(/^\/api/, ''),
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/clusters': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/metrics': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/check': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
