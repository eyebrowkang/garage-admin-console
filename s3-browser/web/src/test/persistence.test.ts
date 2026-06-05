import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readPersistedBool,
  readPersistedNumber,
  readPersistedString,
  writePersistedBool,
  writePersistedNumber,
  writePersistedString,
} from '../lib/persistence';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('readPersistedBool', () => {
  it('maps "1"/"0" to true/false', () => {
    window.localStorage.setItem('k', '1');
    expect(readPersistedBool('k', false)).toBe(true);
    window.localStorage.setItem('k', '0');
    expect(readPersistedBool('k', true)).toBe(false);
  });

  it('returns the fallback when unset or unrecognized', () => {
    expect(readPersistedBool('missing', true)).toBe(true);
    window.localStorage.setItem('k', 'yes');
    expect(readPersistedBool('k', false)).toBe(false);
  });

  it('returns the fallback (does not throw) when localStorage access fails', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPersistedBool('k', true)).toBe(true);
  });
});

describe('writePersistedBool', () => {
  it('persists booleans as "1"/"0"', () => {
    writePersistedBool('k', true);
    expect(window.localStorage.getItem('k')).toBe('1');
    writePersistedBool('k', false);
    expect(window.localStorage.getItem('k')).toBe('0');
  });

  it('swallows quota / privacy-mode write failures', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writePersistedBool('k', true)).not.toThrow();
  });
});

describe('readPersistedString / writePersistedString', () => {
  it('round-trips a string and falls back when missing', () => {
    expect(readPersistedString('missing', 'def')).toBe('def');
    writePersistedString('k', 'hello');
    expect(readPersistedString('k', 'def')).toBe('hello');
  });
});

describe('readPersistedNumber / writePersistedNumber', () => {
  it('round-trips an integer', () => {
    writePersistedNumber('k', 42);
    expect(readPersistedNumber('k', 0)).toBe(42);
  });

  it('falls back when unset or non-numeric', () => {
    expect(readPersistedNumber('missing', 7)).toBe(7);
    window.localStorage.setItem('k', 'not-a-number');
    expect(readPersistedNumber('k', 7)).toBe(7);
  });
});
