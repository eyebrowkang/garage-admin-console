import { describe, expect, it } from 'vitest';

import {
  DEFAULT_S3_BROWSER_REMOTE_ENTRY,
  resolveS3BrowserRemoteEntry,
} from './mf-config';

describe('resolveS3BrowserRemoteEntry', () => {
  it('uses /s3-browser/remoteEntry.js when no override is provided', () => {
    expect(resolveS3BrowserRemoteEntry({})).toBe(DEFAULT_S3_BROWSER_REMOTE_ENTRY);
    expect(DEFAULT_S3_BROWSER_REMOTE_ENTRY).toBe('/s3-browser/remoteEntry.js');
  });

  it('uses the provided remote entry override as-is', () => {
    expect(
      resolveS3BrowserRemoteEntry({
        VITE_S3_BROWSER_REMOTE_ENTRY: 'https://example.invalid/remoteEntry.js',
      }),
    ).toBe('https://example.invalid/remoteEntry.js');
  });
});
