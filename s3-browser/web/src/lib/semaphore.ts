/**
 * A minimal counting semaphore for bounding concurrency.
 *
 * Used to cap the number of in-flight browser→S3 part PUTs GLOBALLY, across
 * every file in an upload job (and across separate jobs), rather than only
 * per-file. Browsers cap concurrent HTTP/1.1 connections per origin at ~6, so a
 * per-file fan-out (4 lanes × N files) just head-of-line stalls and ages
 * presigned URLs; a single shared limiter keeps the real ceiling sane.
 *
 * Permits are handed directly to the next FIFO waiter on release (the count is
 * not bounced up and down), so ordering is preserved and there is no wakeup gap.
 */
export class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = Math.max(1, Math.floor(permits));
  }

  /** Acquire one permit, waiting (FIFO) if none are free. */
  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  /** Release one permit — handed straight to the next waiter if any. */
  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.permits += 1;
    }
  }

  /** Run `fn` while holding a permit; always releases, even on throw. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
