import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTtlSweeper } from '../ttl-sweep.js';

interface Entry {
  expiresAt: number;
  tag: string;
}

const isExpired = (e: { expiresAt: number }, now: number) => e.expiresAt <= now;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createTtlSweeper', () => {
  it('sweep() drops expired entries and keeps fresh ones', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const map = new Map<string, Entry>();
    const sweeper = createTtlSweeper<Entry>(map, isExpired, { intervalMs: 60_000 });

    map.set('stale', { expiresAt: 500, tag: 'stale' });
    map.set('fresh', { expiresAt: 5000, tag: 'fresh' });
    sweeper.sweep();

    expect(map.has('stale')).toBe(false);
    expect(map.has('fresh')).toBe(true);
  });

  it('runs sweeps on the configured interval after ensure()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const map = new Map<string, Entry>();
    const sweeper = createTtlSweeper<Entry>(map, isExpired, { intervalMs: 1000 });

    map.set('a', { expiresAt: 500, tag: 'a' });
    sweeper.ensure();
    expect(map.has('a')).toBe(true); // not swept until the interval fires

    vi.advanceTimersByTime(1000); // now = 1000 → 'a' is expired
    expect(map.has('a')).toBe(false);
  });

  it('self-stops when the map empties and restarts on ensure()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const map = new Map<string, Entry>();
    const sweeper = createTtlSweeper<Entry>(map, isExpired, { intervalMs: 1000 });

    map.set('a', { expiresAt: 100, tag: 'a' });
    sweeper.ensure();
    vi.advanceTimersByTime(1000); // sweeps 'a' → map empty → timer self-stops
    expect(map.size).toBe(0);

    // Timer is stopped, so a freshly-added entry is not swept on its own...
    map.set('b', { expiresAt: 100, tag: 'b' });
    vi.advanceTimersByTime(5000);
    expect(map.has('b')).toBe(true);

    // ...until ensure() restarts it.
    sweeper.ensure();
    vi.advanceTimersByTime(1000);
    expect(map.has('b')).toBe(false);
  });
});
