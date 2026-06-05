import { describe, expect, it, vi } from 'vitest';

import { runBulkDelete } from './bulk-delete';

describe('runBulkDelete', () => {
  it('reports every id as ok when all deletes succeed', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const outcome = await runBulkDelete(['a', 'b', 'c'], deleteOne);
    expect(outcome.ok.sort()).toEqual(['a', 'b', 'c']);
    expect(outcome.failed).toHaveLength(0);
    expect(deleteOne).toHaveBeenCalledTimes(3);
  });

  it('partitions ok and failed on partial failure', async () => {
    const deleteOne = vi.fn((id: string) =>
      id === 'b' ? Promise.reject(new Error('not empty')) : Promise.resolve(),
    );
    const outcome = await runBulkDelete(['a', 'b', 'c'], deleteOne);
    expect(outcome.ok.sort()).toEqual(['a', 'c']);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].id).toBe('b');
    expect(outcome.failed[0].message).toContain('not empty');
  });

  it('does nothing for an empty id list', async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const outcome = await runBulkDelete([], deleteOne);
    expect(outcome).toEqual({ ok: [], failed: [] });
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
