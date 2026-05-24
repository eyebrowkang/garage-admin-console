/**
 * Module Federation entry: full standalone app, Bridge-wrapped.
 *
 * Hosts mount this via `@module-federation/bridge-react` when they want the
 * entire S3 Browser UI (rare — embedding the bare <FileBrowser/> is the
 * primary integration path).
 */
import { createBridgeComponent } from '@module-federation/bridge-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@garage/tokens/style.css';
import '@garage/ui/style.css';
import './index.css';

import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function StandaloneRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

export default createBridgeComponent({ rootComponent: StandaloneRoot });
