import { describe, expect, it } from 'vitest';

import {
  basename,
  fileKind,
  formatBytes,
  formatDate,
  formatDateTime,
  formatNum,
  formatRelativeSeconds,
  formatShortId,
  isTextLikeKind,
  parseExpiryParts,
} from '../format';

describe('formatBytes', () => {
  // Precision rule: 0 dp when value >= 100 or unit is bytes; 1 dp when >= 10; else 2 dp.
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [999, '999 B'],
    [1000, '1.00 kB'],
    [1500, '1.50 kB'],
    [10_000, '10.0 kB'],
    [10_500, '10.5 kB'],
    [100_000, '100 kB'],
    [1_234_567, '1.23 MB'],
    [1_500_000_000, '1.50 GB'],
  ])('formats %d bytes as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('caps at PB for very large inputs', () => {
    expect(formatBytes(5 * 1000 ** 5)).toBe('5.00 PB');
  });

  it.each([[null], [undefined], [NaN], [Infinity], [-Infinity], [-1], [-500]])(
    'renders an em dash for invalid input %s',
    (input) => {
      expect(formatBytes(input as number | null | undefined)).toBe('—');
    },
  );
});

describe('formatDate', () => {
  it('formats an ISO timestamp as a US long date', () => {
    expect(formatDate('2026-05-31T12:00:00Z')).toBe('May 31, 2026');
  });

  it.each([[null], [undefined], ['']])('renders an em dash for %s', (input) => {
    expect(formatDate(input)).toBe('—');
  });

  it('falls back to the raw value for an unparseable date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateTime', () => {
  it('formats an ISO timestamp as YYYY-MM-DD HH:mm (24-hour)', () => {
    expect(formatDateTime('2026-05-31T14:30:00Z')).toBe('2026-05-31 14:30');
  });

  it('zero-pads month, day, hour, and minute', () => {
    expect(formatDateTime('2026-01-02T03:05:00Z')).toBe('2026-01-02 03:05');
  });

  it('renders an em dash for missing input', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('falls back to the raw value when unparseable', () => {
    expect(formatDateTime('garbage')).toBe('garbage');
  });
});

describe('formatRelativeSeconds', () => {
  it.each([
    [0, '0s ago'],
    [45, '45s ago'],
    [59, '59s ago'],
    [60, '1m ago'],
    [3599, '59m ago'],
    [3600, '1h ago'],
    [47 * 3600, '47h ago'],
    [48 * 3600, '2d ago'],
    [10 * 86400, '10d ago'],
  ])('formats %d seconds as %s', (input, expected) => {
    expect(formatRelativeSeconds(input)).toBe(expected);
  });

  it('floors fractional seconds', () => {
    expect(formatRelativeSeconds(59.9)).toBe('59s ago');
  });

  it('clamps negatives to zero', () => {
    expect(formatRelativeSeconds(-5)).toBe('0s ago');
  });

  it.each([[null], [undefined]])('renders an em dash for %s', (input) => {
    expect(formatRelativeSeconds(input)).toBe('—');
  });
});

describe('formatShortId', () => {
  it('truncates a long id with an ellipsis at the default length (8)', () => {
    expect(formatShortId('0123456789abcdef')).toBe('01234567...');
  });

  it('respects a custom length', () => {
    expect(formatShortId('0123456789abcdef', 4)).toBe('0123...');
  });

  it('returns ids at or below the length unchanged', () => {
    expect(formatShortId('abc')).toBe('abc');
    expect(formatShortId('exactly8')).toBe('exactly8');
  });
});

describe('formatNum', () => {
  it.each([
    [42, '42'],
    [1000, '1,000'],
    [1_234_567, '1,234,567'],
  ])('groups %d as %s', (input, expected) => {
    expect(formatNum(input)).toBe(expected);
  });
});

describe('basename', () => {
  it.each([
    ['file.txt', 'file.txt'],
    ['dir/file.txt', 'file.txt'],
    ['a/b/c/deep.json', 'deep.json'],
    ['folder/', 'folder'],
    ['a/b/sub/', 'sub'],
    ['', ''],
    ['no-slash', 'no-slash'],
  ])('basename(%j) === %j', (input, expected) => {
    expect(basename(input)).toBe(expected);
  });
});

describe('fileKind', () => {
  it.each([
    ['photo.JPG', 'image'],
    ['icon.svg', 'image'],
    ['notes.txt', 'text'],
    ['data.json', 'json'],
    ['README.md', 'markdown'],
    ['table.csv', 'csv'],
    ['main.ts', 'code'],
    ['style.scss', 'code'],
    ['bundle.tar.gz', 'archive'],
    ['archive.zip', 'archive'],
    ['noext', 'unknown'],
    ['mystery.xyz', 'unknown'],
  ])('classifies %s as %s', (name, kind) => {
    expect(fileKind(name)).toBe(kind);
  });
});

describe('isTextLikeKind', () => {
  it('treats text/json/markdown/csv/code as text-like', () => {
    for (const k of ['text', 'json', 'markdown', 'csv', 'code'] as const) {
      expect(isTextLikeKind(k)).toBe(true);
    }
  });

  it('treats image/archive/unknown as not text-like', () => {
    for (const k of ['image', 'archive', 'unknown'] as const) {
      expect(isTextLikeKind(k)).toBe(false);
    }
  });
});

describe('parseExpiryParts', () => {
  // web-shared's vitest pins TZ=UTC, so the local fields equal the UTC clock here.
  it('decomposes a timestamp into local date/hour/minute strings', () => {
    expect(parseExpiryParts('2026-05-31T14:30:00Z')).toEqual({
      date: '2026-05-31',
      hour: '14',
      minute: '30',
    });
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    expect(parseExpiryParts('2026-01-02T03:05:00Z')).toEqual({
      date: '2026-01-02',
      hour: '03',
      minute: '05',
    });
  });

  it.each([[null], [undefined], [''], ['not-a-date']])(
    'returns the empty "no expiry" parts for %s',
    (input) => {
      expect(parseExpiryParts(input)).toEqual({ date: '', hour: '00', minute: '00' });
    },
  );
});
