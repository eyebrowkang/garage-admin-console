import React, { Suspense } from 'react';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';

const RemoteObjectBrowser = React.lazy(() =>
  import('s3_browser/ObjectBrowser').then((m) => ({ default: m.ObjectBrowser })),
);

export function S3BrowserTest() {
  return (
    <div className="p-8">
      <h1 className="mb-4 text-xl font-bold">Module Federation Test</h1>
      <Suspense fallback={<PageLoadingState label="Loading S3 Browser component..." />}>
        <RemoteObjectBrowser bucket="test-bucket" />
      </Suspense>
    </div>
  );
}
