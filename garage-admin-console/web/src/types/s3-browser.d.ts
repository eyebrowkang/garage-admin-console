/**
 * Type shims for the federated s3Browser remote.
 *
 * s3-browser/web emits real .d.ts files via @module-federation/rsbuild-plugin
 * (`dts: true`), but those land in `@mf-types/` only after the remote has been
 * built once. To keep `pnpm typecheck` green from a clean clone, we declare
 * the surface here too — keep in lock-step with FileBrowserProps in
 * s3-browser/web/src/features/file-browser/FileBrowser.tsx.
 */

declare module 's3Browser/FileBrowser' {
  import type { ComponentType } from 'react';

  export interface S3Object {
    key: string;
    size: number;
    etag: string;
    lastModified: string | null;
    storageClass: string | null;
    contentType?: string | null;
  }

  export interface FileBrowserProps {
    backend: {
      /** Already encodes the bucket: e.g. /api/clusters/{id}/buckets/{name} */
      baseUrl: string;
      /** JWT — never a Garage admin token. */
      authToken: string;
      /** Extra headers forwarded on every BFF request (e.g. X-Garage-Access-Key-Id). */
      headers?: Record<string, string>;
    };
    /** Display-only; baseUrl already encodes which bucket we're in. */
    bucket: string;
    path: string[];
    onPathChange: (path: string[]) => void;
    viewMode?: 'list' | 'grid';
    onViewModeChange?: (mode: 'list' | 'grid') => void;
    density?: 'compact' | 'comfortable';
    showPreview?: boolean;
    onSelect?: (items: S3Object[]) => void;
    onError?: (err: Error) => void;
  }

  const FileBrowser: ComponentType<FileBrowserProps>;
  export default FileBrowser;
}
