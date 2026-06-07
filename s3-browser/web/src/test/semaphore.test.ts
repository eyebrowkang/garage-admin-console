import { describe, expect, it } from 'vitest';

import { Semaphore } from '../lib/semaphore';

/** A promise plus its resolver, for hand-controlling task completion. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Semaphore', () => {
  it('never lets more than `permits` tasks run at once', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;
    const gates = Array.from({ length: 5 }, () => deferred());

    const runs = gates.map((g, i) =>
      sem.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await g.promise;
        active -= 1;
        return i;
      }),
    );

    // Let the first batch acquire.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(2);

    // Release one at a time; the cap must hold throughout.
    for (const g of gates) {
      g.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(maxActive).toBe(2);
    }

    const results = await Promise.all(runs);
    expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(active).toBe(0);
  });

  it('hands permits to waiters in FIFO order', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];
    const gate = deferred();

    const first = sem.run(async () => {
      order.push(0);
      await gate.promise;
    });
    // These queue behind the first while it holds the only permit.
    const second = sem.run(async () => {
      order.push(1);
    });
    const third = sem.run(async () => {
      order.push(2);
    });

    await Promise.resolve();
    expect(order).toEqual([0]); // only the first acquired

    gate.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([0, 1, 2]);
  });

  it('releases the permit even when the task throws', async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // If the permit leaked, this second run would hang forever.
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });
});
