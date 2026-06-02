import { describe, expect, it } from 'vitest';

import { getApiErrorMessage } from '../errors';

// A minimal axios-error duck type: getApiErrorMessage only needs
// `isAxiosError === true`, `.response.data`, and `.message`.
function axiosError(data: unknown, message = 'Request failed with status code 400') {
  return { isAxiosError: true, message, response: { data, status: 400 } };
}

describe('getApiErrorMessage', () => {
  it('returns a string response body verbatim', () => {
    expect(getApiErrorMessage(axiosError('boom'))).toBe('boom');
  });

  it('prefers data.message, prefixing data.code when present', () => {
    expect(getApiErrorMessage(axiosError({ message: 'bad input' }))).toBe('bad input');
    expect(getApiErrorMessage(axiosError({ message: 'bad input', code: 'E42' }))).toBe(
      'E42: bad input',
    );
  });

  it('reads a string data.error', () => {
    expect(getApiErrorMessage(axiosError({ error: 'nope' }))).toBe('nope');
  });

  it('joins messages from an array data.error (skipping empty items)', () => {
    expect(getApiErrorMessage(axiosError({ error: [{ message: 'a' }, { message: 'b' }, {}] }))).toBe(
      'a, b',
    );
  });

  it('reads a nested object data.error.message', () => {
    expect(getApiErrorMessage(axiosError({ error: { message: 'deep' } }))).toBe('deep');
  });

  it('falls back to the axios error message when the body has nothing usable', () => {
    expect(getApiErrorMessage(axiosError({}, 'Network Error'))).toBe('Network Error');
  });

  it('handles a plain Error', () => {
    expect(getApiErrorMessage(new Error('plain boom'))).toBe('plain boom');
  });

  it('uses the fallback for non-error values', () => {
    expect(getApiErrorMessage(undefined)).toBe('Request failed');
    expect(getApiErrorMessage('a bare string')).toBe('Request failed');
    expect(getApiErrorMessage({}, 'custom fallback')).toBe('custom fallback');
  });
});
