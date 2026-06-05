/**
 * Periodic, self-stopping sweeper for a TTL'd Map.
 *
 * The S3-client and CORS caches evict an entry when it is next looked up past
 * its TTL — but an entry whose key is never requested again would otherwise
 * linger forever. This sweeper walks the map on an interval and drops expired
 * entries regardless of re-lookup, so the caches can't grow without bound. It
 * only removes map entries; any resource teardown is the caller's concern (the
 * S3-client cache deliberately leaves stale clients for GC — destroying one
 * could abort an in-flight stream still borrowing it).
 *
 * The interval timer is `unref`'d — it never keeps the process alive — and it
 * stops itself once the map is empty, restarting on the next `ensure()`.
 */
export interface TtlSweeper {
  /** Start the sweep timer if it isn't already running. Call after each insert. */
  ensure(): void;
  /** Stop the sweep timer (e.g. on shutdown or in test teardown). */
  stop(): void;
  /** Run one sweep immediately. Exposed for deterministic testing. */
  sweep(): void;
}

export interface TtlSweeperOptions {
  intervalMs: number;
}

export function createTtlSweeper<V>(
  map: Map<string, V>,
  isExpired: (value: V, now: number) => boolean,
  options: TtlSweeperOptions,
): TtlSweeper {
  let timer: ReturnType<typeof setInterval> | null = null;

  function sweep(): void {
    const now = Date.now();
    for (const [key, value] of map) {
      if (isExpired(value, now)) map.delete(key);
    }
    if (map.size === 0) stop();
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function ensure(): void {
    if (timer) return;
    timer = setInterval(sweep, options.intervalMs);
    timer.unref?.();
  }

  return { ensure, stop, sweep };
}
