import axios, { type AxiosInstance } from 'axios';
import type { S3EmbedConfig } from '@/providers/S3EmbedProvider';

/**
 * Creates an axios instance configured for embedded mode.
 * Uses the embed config's apiBase and optional token.
 */
export function createEmbedApi(config: S3EmbedConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.apiBase,
  });

  if (config.token) {
    instance.interceptors.request.use((reqConfig) => {
      reqConfig.headers.Authorization = `Bearer ${config.token}`;
      return reqConfig;
    });
  }

  return instance;
}
