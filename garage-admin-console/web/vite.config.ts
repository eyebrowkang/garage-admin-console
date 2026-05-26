import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * No `@module-federation/vite` plugin here on purpose. That plugin wraps the
 * host's MF instance under an `__mfe_internal__*` name and tries to register
 * shared deps via build-time transforms. In a Vite-host ⇄ Rsbuild-remote
 * setup the timing doesn't line up: the Rsbuild-built remote's
 * `consume_default_react` wrapper runs BEFORE the host's transformed share
 * registration, so the remote falls back to its own bundled React copy and
 * React 19's two-copies guard throws "Invalid hook call".
 *
 * Instead the host uses `@module-federation/runtime` directly from
 * src/mf-init.ts. That file calls `init()` synchronously with explicit `lib`
 * references to the host's React/ReactDOM, populating the default share
 * scope before any remote loads. src/components/cluster/BucketObjectBrowser
 * then calls `loadRemote('s3Browser/FileBrowser')` from the same runtime.
 */
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
            if (id.includes('echarts')) return 'vendor-echarts';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
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
      },
    },
  };
});
