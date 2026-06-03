import { getApiErrorMessage } from '@garage/web-shared';

export interface BulkOutcome {
  ok: string[];
  failed: { id: string; message: string }[];
}

/**
 * The Garage Admin API has no batch-delete endpoint, so "delete N selected" is
 * N single DeleteX calls. We run them with a small concurrency cap — predictable
 * enough not to hammer the cluster, parallel enough not to crawl — and collect a
 * per-item outcome so the UI can report partial failures (e.g. a bucket that
 * wasn't empty) instead of an all-or-nothing result.
 */
export async function runBulkDelete(
  ids: string[],
  deleteOne: (id: string) => Promise<void>,
  concurrency = 4,
): Promise<BulkOutcome> {
  const ok: string[] = [];
  const failed: { id: string; message: string }[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await deleteOne(id);
        ok.push(id);
      } catch (err) {
        failed.push({ id, message: getApiErrorMessage(err) });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
  await Promise.all(workers);
  return { ok, failed };
}
