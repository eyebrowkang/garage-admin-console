import { describe, expect, it } from 'vitest';

import { classifyError, isRecoverable } from '../file-browser/types';

describe('classifyError', () => {
  it('extracts the status and message from an axios-like error', () => {
    const err = {
      isAxiosError: true,
      message: 'Request failed',
      response: { status: 403, data: { error: 'Access denied' } },
    };
    expect(classifyError(err)).toEqual({ message: 'Access denied', status: 403 });
  });

  it('returns an undefined status for a plain Error', () => {
    const result = classifyError(new Error('boom'));
    expect(result.message).toBe('boom');
    expect(result.status).toBeUndefined();
  });

  it('falls back to the default message for an opaque value', () => {
    expect(classifyError(undefined)).toEqual({ message: 'Request failed', status: undefined });
  });
});

describe('isRecoverable', () => {
  it('treats 403 as unrecoverable', () => {
    expect(isRecoverable({ message: 'x', status: 403 })).toBe(false);
  });

  it('treats other statuses (and none) as recoverable', () => {
    expect(isRecoverable({ message: 'x', status: 500 })).toBe(true);
    expect(isRecoverable({ message: 'x', status: 404 })).toBe(true);
    expect(isRecoverable({ message: 'x' })).toBe(true);
  });
});
