/**
 * Dev-only in-memory fixtures for the FileBrowser playground.
 *
 * A flat list of S3 objects, served through the same `/list` (prefix +
 * delimiter) semantics the real Bucket Backend API uses, so the FileBrowser
 * behaves exactly as it would against Garage — folders, pagination, mixed
 * types, deep nesting, long names, and edge-case sizes/dates all included for
 * mobile-UX work. NOT bundled in production (only imported by the playground).
 */
import type { ListResult, S3Object } from '@/lib/types';

const D = (day: string) => `${day}T10:30:00.000Z`;

function obj(key: string, size: number, lastModified: string, contentType?: string): S3Object {
  return {
    key,
    size,
    etag: `"${(key.length * 7 + size).toString(16)}"`,
    lastModified,
    storageClass: 'STANDARD',
    contentType: contentType ?? null,
  };
}

// A big folder to exercise virtualization + "Load More" pagination + grid.
const photos2024: S3Object[] = Array.from({ length: 58 }, (_, i) => {
  const n = String(i + 1).padStart(4, '0');
  const month = String((i % 12) + 1).padStart(2, '0');
  const day = String((i % 27) + 1).padStart(2, '0');
  const min = String(i % 60).padStart(2, '0');
  return obj(
    `Photos/2024/IMG_2024${n}.jpg`,
    1_800_000 + i * 53_000,
    `2024-${month}-${day}T14:${min}:00.000Z`,
    'image/jpeg',
  );
});

const invoices: S3Object[] = Array.from({ length: 18 }, (_, i) => {
  const n = String(i + 1).padStart(4, '0');
  const month = String((i % 12) + 1).padStart(2, '0');
  return obj(
    `Documents/Invoices/invoice-${n}.pdf`,
    84_000 + i * 1200,
    `2024-${month}-15T09:00:00.000Z`,
    'application/pdf',
  );
});

let OBJECTS: S3Object[] = [
  // root files — long name, no extension, hidden dotfile, 0-byte, huge
  obj('README.md', 4096, D('2024-11-02'), 'text/markdown'),
  obj('LICENSE', 11_357, D('2021-03-14'), 'text/plain'),
  obj('budget-2024.xlsx', 248_000, D('2024-10-21'), 'application/vnd.ms-excel'),
  obj(
    'presentation-final-v2-really-final-revised.pptx',
    5_400_000,
    D('2024-09-30'),
    'application/vnd.ms-powerpoint',
  ),
  obj('.gitignore', 320, D('2023-06-01'), 'text/plain'),
  obj('archive.tar.gz', 87_400_000, D('2024-08-12'), 'application/gzip'),
  obj('dataset-full-export-2024-12-01.csv', 1_640_000_000, D('2024-12-01'), 'text/csv'),
  obj('empty.txt', 0, D('2025-01-03'), 'text/plain'),
  obj('logo.png', 64_200, D('2024-07-19'), 'image/png'),
  // Documents
  obj('Documents/Q4-report.pdf', 1_240_000, D('2024-12-18'), 'application/pdf'),
  obj('Documents/notes.txt', 8900, D('2025-01-20'), 'text/plain'),
  obj('Documents/meeting-minutes-2024.docx', 132_000, D('2024-11-28'), 'application/msword'),
  obj('Documents/contract-signed.pdf', 540_000, D('2024-05-09'), 'application/pdf'),
  obj('Documents/Drafts/draft-proposal.md', 6200, D('2024-10-02'), 'text/markdown'),
  ...invoices,
  // Photos
  obj('Photos/cover.jpg', 2_300_000, D('2024-06-15'), 'image/jpeg'),
  obj('Photos/2023/trip.jpg', 3_100_000, D('2023-08-22'), 'image/jpeg'),
  obj('Photos/2023/family.jpg', 2_700_000, D('2023-12-25'), 'image/jpeg'),
  obj('Photos/Screenshots/Screenshot-2024-12-31.png', 412_000, D('2024-12-31'), 'image/png'),
  ...photos2024,
  // Projects
  obj('Projects/garage/index.ts', 12_400, D('2025-01-15'), 'text/typescript'),
  obj('Projects/garage/package.json', 1840, D('2025-01-15'), 'application/json'),
  obj('Projects/garage/README.md', 5300, D('2025-01-10'), 'text/markdown'),
  obj('Projects/garage/Dockerfile', 720, D('2024-12-20'), 'text/plain'),
  obj('Projects/website/index.html', 3400, D('2024-11-11'), 'text/html'),
  obj('Projects/website/styles.css', 8800, D('2024-11-11'), 'text/css'),
  obj('Projects/website/app.js', 24_000, D('2024-11-12'), 'text/javascript'),
  obj('Projects/website/assets/hero.jpg', 1_900_000, D('2024-11-10'), 'image/jpeg'),
  // Backups — multi-GB
  obj('Backups/backup-2024-01.zip', 2_340_000_000, D('2024-01-31'), 'application/zip'),
  obj('Backups/backup-2024-02.zip', 2_410_000_000, D('2024-02-29'), 'application/zip'),
  obj('Backups/db-snapshot.sql.gz', 184_000_000, D('2024-12-05'), 'application/gzip'),
  // Videos
  obj('Videos/vacation.mp4', 1_230_000_000, D('2024-07-04'), 'video/mp4'),
  obj('Videos/demo-recording.mov', 540_000_000, D('2024-09-18'), 'video/quicktime'),
  obj('Videos/tutorial.webm', 88_000_000, D('2024-10-30'), 'video/webm'),
  // Music
  obj('Music/track-01.mp3', 7_200_000, D('2023-04-01'), 'audio/mpeg'),
  obj('Music/track-02.mp3', 6_800_000, D('2023-04-01'), 'audio/mpeg'),
];

const PAGE_SIZE = 50;

/** S3-style prefix listing with a delimiter: direct files + child folder prefixes. */
export function mockList(prefix = '', continuationToken?: string): ListResult {
  const matching = OBJECTS.filter((o) => o.key.startsWith(prefix));
  const prefixSet = new Set<string>();
  const directFiles: S3Object[] = [];
  for (const o of matching) {
    const rest = o.key.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) directFiles.push(o);
    else prefixSet.add(prefix + rest.slice(0, slash + 1));
  }
  directFiles.sort((a, b) => a.key.localeCompare(b.key));

  const start = continuationToken ? Number(continuationToken) : 0;
  const page = directFiles.slice(start, start + PAGE_SIZE);
  const nextStart = start + PAGE_SIZE;
  return {
    objects: page,
    prefixes: start === 0 ? [...prefixSet].sort() : [],
    nextContinuationToken: nextStart < directFiles.length ? String(nextStart) : undefined,
  };
}

export function mockGetObject(key: string): S3Object {
  return OBJECTS.find((o) => o.key === key) ?? obj(key, 0, D('2024-01-01'));
}

export function mockDelete(keys: string[]): { deleted: string[]; errors: never[] } {
  OBJECTS = OBJECTS.filter(
    (o) => !keys.some((k) => o.key === k || (k.endsWith('/') && o.key.startsWith(k))),
  );
  return { deleted: keys, errors: [] };
}

export function mockCopy(src: string, dst: string): void {
  if (src.endsWith('/')) {
    // folder copy: clone every object under the prefix
    for (const o of OBJECTS.filter((o) => o.key.startsWith(src))) {
      OBJECTS.push({ ...o, key: dst + o.key.slice(src.length) });
    }
    return;
  }
  const found = OBJECTS.find((o) => o.key === src);
  if (found && !OBJECTS.some((o) => o.key === dst)) OBJECTS.push({ ...found, key: dst });
}

/** Register uploaded keys (real files or a new folder's `.keep` sentinel). */
export function mockUpload(keys: string[]): void {
  const now = new Date().toISOString();
  for (const key of keys) {
    if (!OBJECTS.some((o) => o.key === key)) OBJECTS.push(obj(key, key.endsWith('.keep') ? 0 : 2048, now));
  }
}
