import { describe, expect, it } from 'vitest';

import { createAppQueryClient } from '../query-client';

type RetryFn = (failureCount: number, error: unknown) => boolean;

function retryPolicy(): RetryFn {
  return createAppQueryClient().getDefaultOptions().queries!.retry as RetryFn;
}

describe('createAppQueryClient', () => {
  it('applies the shared query defaults', () => {
    const defaults = createAppQueryClient().getDefaultOptions().queries!;
    expect(defaults.staleTime).toBe(30000);
    expect(defaults.refetchOnWindowFocus).toBe(false);
  });

  it('stops retrying immediately on 401 and 403', () => {
    const retry = retryPolicy();
    expect(retry(0, { response: { status: 401 } })).toBe(false);
    expect(retry(0, { response: { status: 403 } })).toBe(false);
  });

  it('allows up to 3 attempts for other errors', () => {
    const retry = retryPolicy();
    expect(retry(0, { response: { status: 500 } })).toBe(true);
    expect(retry(2, new Error('network'))).toBe(true);
    expect(retry(3, new Error('network'))).toBe(false);
  });
});
