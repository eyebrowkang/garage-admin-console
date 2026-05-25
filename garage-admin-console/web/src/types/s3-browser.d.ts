/**
 * Type shims for the federated s3Browser remote.
 *
 * s3-browser/web emits real .d.ts files via @module-federation/rsbuild-plugin
 * (`dts: true`), but those land in `@mf-types/` only after the remote has been
 * built once. To keep `pnpm typecheck` green from a clean clone, we declare
 * the surface here too — kept in lock-step with §2.5 of
 * designs/mf-integration-plan.md.
 */

declare module 's3Browser/FileBrowser' {
  import type { ComponentType } from 'react';

  export interface S3Object {
    key: string;
    size: number;
    etag: string;
    lastModified: string | null;
    storageClass: string | null;
  }

  export interface FileBrowserProps {
    backend: {
      /** Already encodes the bucket: e.g. /api/clusters/{id}/buckets/{name} */
      baseUrl: string;
      /** JWT — never a Garage admin token. */
      authToken: string;
    };
    /** Display-only; baseUrl already encodes which bucket we're in. */
    bucket: string;
    path: string[];
    onPathChange: (path: string[]) => void;
    viewMode?: 'list' | 'details' | 'grid';
    onViewModeChange?: (mode: 'list' | 'details' | 'grid') => void;
    density?: 'compact' | 'comfortable';
    showPreview?: boolean;
    onSelect?: (items: S3Object[]) => void;
    onError?: (err: Error) => void;
  }

  const FileBrowser: ComponentType<FileBrowserProps>;
  export default FileBrowser;
}
