import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUploadSessionStore, fingerprintFile } from '../lib/upload-sessions';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

const session = (over: Partial<{ key: string; uploadId: string; partSize: number }> = {}) => ({
  key: 'k',
  uploadId: 'u',
  partSize: 8,
  createdAt: Date.now(),
  ...over,
});

describe('upload-sessions', () => {
  it('round-trips a session, namespaced by baseUrl + fingerprint', () => {
    const store = createUploadSessionStore();
    store.put('https://a/bucket', 'f1', session({ uploadId: 'u1' }));
    expect(store.get('https://a/bucket', 'f1')?.uploadId).toBe('u1');
    expect(store.get('https://a/bucket', 'other')).toBeNull();
    expect(store.get('https://b/bucket', 'f1')).toBeNull(); // namespace isolation
  });

  it('removes a session', () => {
    const store = createUploadSessionStore();
    store.put('ns', 'f', session());
    store.remove('ns', 'f');
    expect(store.get('ns', 'f')).toBeNull();
  });

  it('prunes sessions older than the TTL on construction', () => {
    const seed = createUploadSessionStore();
    seed.put('ns', 'fresh', session({ uploadId: 'fresh' }));
    seed.put('ns', 'stale', {
      key: 'k',
      uploadId: 'stale',
      partSize: 8,
      createdAt: Date.now() - 5000,
    });

    const pruned = createUploadSessionStore(1000); // 1s TTL
    expect(pruned.get('ns', 'fresh')?.uploadId).toBe('fresh');
    expect(pruned.get('ns', 'stale')).toBeNull();
  });

  it('survives a corrupt store blob', () => {
    localStorage.setItem('s3-browser.upload-sessions', 'not json{');
    const store = createUploadSessionStore();
    expect(store.get('ns', 'f')).toBeNull();
    store.put('ns', 'f', session());
    expect(store.get('ns', 'f')?.uploadId).toBe('u');
  });

  it('fingerprintFile combines name, size and lastModified', () => {
    const f = new File([new Uint8Array(3)], 'a.txt');
    expect(fingerprintFile(f)).toBe(`a.txt::3::${f.lastModified}`);
  });
});
