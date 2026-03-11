/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';

export interface S3EmbedConfig {
  apiBase: string;
  connectionId: string;
  bucket?: string;
  readonly?: boolean;
  token?: string;
}

const S3EmbedContext = createContext<S3EmbedConfig | null>(null);

export function useS3EmbedContext(): S3EmbedConfig | null {
  return useContext(S3EmbedContext);
}

export function S3EmbedProvider({
  config,
  children,
}: {
  config: S3EmbedConfig;
  children: ReactNode;
}) {
  return <S3EmbedContext.Provider value={config}>{children}</S3EmbedContext.Provider>;
}
