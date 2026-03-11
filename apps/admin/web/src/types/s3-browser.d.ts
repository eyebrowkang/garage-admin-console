declare module 's3_browser/ObjectBrowser' {
  import type { ComponentType } from 'react';
  const ObjectBrowser: ComponentType<{ bucket?: string }>;
  export { ObjectBrowser };
}

declare module 's3_browser/BucketExplorer' {
  import type { ComponentType } from 'react';
  const BucketExplorer: ComponentType;
  export { BucketExplorer };
}

declare module 's3_browser/S3EmbedProvider' {
  import type { ComponentType, ReactNode } from 'react';
  interface S3EmbedConfig {
    apiBase: string;
    bucket?: string;
    readonly?: boolean;
  }
  const S3EmbedProvider: ComponentType<{ config: S3EmbedConfig; children: ReactNode }>;
  export { S3EmbedProvider };
  export function useS3EmbedContext(): S3EmbedConfig | null;
}
