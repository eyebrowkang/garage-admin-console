// Initialize the Module Federation runtime BEFORE React is touched so the shared
// scope is populated for any federated remote (e.g. s3Browser/FileBrowser). As
// the MF *host*, this app provides React to the scope, so a synchronous entry is
// fine — unlike the S3 Browser *remote*, which needs an async bootstrap boundary.
import './mf-init';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAppQueryClient } from '@garage/web-shared';
import './index.css';
import App from './App';

const queryClient = createAppQueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
