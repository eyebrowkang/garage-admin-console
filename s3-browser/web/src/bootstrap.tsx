/**
 * Bootstrap stage of the standalone entry — split from main.tsx so the
 * top-level chunk can establish the Module Federation async boundary
 * BEFORE any shared dep (react, react-dom) is required synchronously.
 *
 * See https://module-federation.io/guide/troubleshooting/runtime#runtime-006
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// All stylesheet imports (tokens + ui + tailwind base) flow through index.css
// so Tailwind v4 resolves them in a single pass.
import './index.css';

import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
