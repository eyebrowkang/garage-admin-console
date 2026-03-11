export const DEFAULT_S3_BROWSER_REMOTE_ENTRY = '/s3-browser/remoteEntry.js';

export function resolveS3BrowserRemoteEntry(env?: Record<string, string | undefined>) {
  const override = env?.VITE_S3_BROWSER_REMOTE_ENTRY?.trim();
  return override || DEFAULT_S3_BROWSER_REMOTE_ENTRY;
}
