/**
 * Dev-only FileBrowser harness — renders the federated component against the
 * in-memory mock backend so its UX (especially mobile) can be iterated on with
 * no BFF / Garage / credentials. Reachable at `/__playground` in dev only;
 * lazy-loaded so the mock adapter is never installed in the real app.
 */
import { useState } from 'react';
import { FileBrowser, type FileBrowserViewMode } from '@/file-browser/FileBrowser';
import { installMockAdapter } from './mockAdapter';

// Runs on lazy import — before FileBrowser creates its axios instance on mount.
installMockAdapter();

export default function FileBrowserPlayground() {
  const [path, setPath] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<FileBrowserViewMode>('list');

  return (
    <div className="h-screen w-screen overflow-hidden bg-card">
      <FileBrowser
        backend={{ baseUrl: '/__mockapi', authToken: 'mock-token' }}
        bucket="demo-bucket"
        path={path}
        onPathChange={setPath}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        density="comfortable"
      />
    </div>
  );
}
