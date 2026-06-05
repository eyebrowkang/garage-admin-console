import { describe, expect, it } from 'vitest';

import { decideUploadResponse } from '../router.js';

const ok = (): PromiseSettledResult<void> => ({ status: 'fulfilled', value: undefined });
const rejected = (reason: unknown): PromiseSettledResult<void> => ({ status: 'rejected', reason });

const uploaded = [{ key: 'a.txt', etag: 'e1', size: 3 }];

describe('decideUploadResponse', () => {
  it('200s with the uploaded list when every file succeeds', () => {
    const r = decideUploadResponse([ok(), ok()], {
      aborted: false,
      oversized: false,
      uploaded,
      limit: 1000,
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ uploaded });
  });

  it('413s but still reports the files that fit when a sibling is oversized', () => {
    const r = decideUploadResponse([ok()], {
      aborted: false,
      oversized: true,
      uploaded,
      limit: 1000,
    });
    expect(r.status).toBe(413);
    // The bug this guards: a sibling's 413 must NOT drop an already-stored file.
    expect(r.body.uploaded).toEqual(uploaded);
    expect(r.body.limit).toBe(1000);
  });

  it('502s on a genuine upload failure, surfacing the reason', () => {
    const r = decideUploadResponse([ok(), rejected(new Error('s3 down'))], {
      aborted: false,
      oversized: false,
      uploaded,
      limit: 1000,
    });
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toContain('s3 down');
  });

  it('lets a genuine failure outrank an oversize', () => {
    const r = decideUploadResponse([rejected(new Error('boom'))], {
      aborted: false,
      oversized: true,
      uploaded,
      limit: 1000,
    });
    expect(r.status).toBe(502);
  });

  it('502s when the request was aborted by the client', () => {
    const r = decideUploadResponse([], {
      aborted: true,
      oversized: false,
      uploaded: [],
      limit: 1000,
    });
    expect(r.status).toBe(502);
  });
});
