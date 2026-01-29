import { describe, it, expect } from 'vitest';
import { formatBytes, formatDateTime, formatShortId, formatRelativeSeconds } from './format';

describe('formatBytes', () => {
  it('returns "-" for null or undefined', () => {
    expect(formatBytes(null)).toBe('-');
    expect(formatBytes(undefined)).toBe('-');
  });

  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    // Uses 1000-based divisions, not 1024
    expect(formatBytes(1000)).toBe('1.00 kB');
    expect(formatBytes(1500)).toBe('1.50 kB');
    expect(formatBytes(1000000)).toBe('1.00 MB');
    expect(formatBytes(1000000000)).toBe('1.00 GB');
    expect(formatBytes(1000000000000)).toBe('1.00 TB');
  });

  it('handles large numbers', () => {
    expect(formatBytes(5 * 1000000000000)).toBe('5.00 TB');
  });
});

describe('formatShortId', () => {
  it('shortens long IDs', () => {
    const longId = '1234567890abcdef1234567890abcdef';
    expect(formatShortId(longId, 8)).toBe('12345678...');
    expect(formatShortId(longId, 16)).toBe('1234567890abcdef...');
  });

  it('returns full ID if shorter than limit', () => {
    expect(formatShortId('short', 10)).toBe('short');
  });

  it('handles default length', () => {
    const id = '1234567890';
    expect(formatShortId(id)).toBe('12345678...');
  });
});

describe('formatDateTime', () => {
  it('returns "-" for null or undefined', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime(undefined)).toBe('-');
  });

  it('formats valid date strings', () => {
    const result = formatDateTime('2024-01-15T10:30:00Z');
    expect(result).toContain('2024');
    expect(result).not.toBe('-');
  });
});

describe('formatRelativeSeconds', () => {
  it('formats seconds correctly', () => {
    expect(formatRelativeSeconds(30)).toBe('30s ago');
    expect(formatRelativeSeconds(1)).toBe('1s ago');
    expect(formatRelativeSeconds(0)).toBe('0s ago');
  });

  it('formats minutes correctly', () => {
    expect(formatRelativeSeconds(60)).toBe('1m ago');
    expect(formatRelativeSeconds(120)).toBe('2m ago');
    expect(formatRelativeSeconds(90)).toBe('1m ago'); // floor(90/60) = 1
  });

  it('formats hours correctly', () => {
    expect(formatRelativeSeconds(3600)).toBe('1h ago');
    expect(formatRelativeSeconds(7200)).toBe('2h ago');
  });

  it('formats days correctly', () => {
    // Note: only shows days when >= 48 hours
    expect(formatRelativeSeconds(172800)).toBe('2d ago'); // 48 hours = 2 days
    expect(formatRelativeSeconds(259200)).toBe('3d ago'); // 72 hours = 3 days
  });
});
