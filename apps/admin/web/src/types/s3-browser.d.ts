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
    connectionId: string;
    bucket?: string;
    readonly?: boolean;
    token?: string;
  }
  const S3EmbedProvider: ComponentType<{ config: S3EmbedConfig; children: ReactNode }>;
  export { S3EmbedProvider };
  export type { S3EmbedConfig };
  export function useS3EmbedContext(): S3EmbedConfig | null;
}
