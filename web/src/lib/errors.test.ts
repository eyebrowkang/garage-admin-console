import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from './errors';
import { AxiosError } from 'axios';

describe('getApiErrorMessage', () => {
  it('returns default message for null error', () => {
    expect(getApiErrorMessage(null, 'Default')).toBe('Default');
    expect(getApiErrorMessage(null)).toBe('Request failed'); // Default fallback
  });

  it('extracts error string from axios error response', () => {
    // Create a real AxiosError to pass axios.isAxiosError check
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      data: { error: 'Error string' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    };

    expect(getApiErrorMessage(axiosError)).toBe('Error string');
  });

  it('extracts error array messages from axios error response', () => {
    const axiosError = new AxiosError('Request failed');
    axiosError.response = {
      data: { error: [{ message: 'Error 1' }, { message: 'Error 2' }] },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
    };

    expect(getApiErrorMessage(axiosError)).toBe('Error 1, Error 2');
  });

  it('uses axios error message as fallback', () => {
    const axiosError = new AxiosError('Network Error');
    expect(getApiErrorMessage(axiosError)).toBe('Network Error');
  });

  it('handles Error instances', () => {
    const error = new Error('Error message');
    expect(getApiErrorMessage(error)).toBe('Error message');
  });

  it('returns default for unknown error types', () => {
    expect(getApiErrorMessage({})).toBe('Request failed');
    expect(getApiErrorMessage(123)).toBe('Request failed');
    expect(getApiErrorMessage('String error')).toBe('Request failed');
  });

  it('uses custom fallback message', () => {
    expect(getApiErrorMessage({}, 'Custom fallback')).toBe('Custom fallback');
    expect(getApiErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });
});
