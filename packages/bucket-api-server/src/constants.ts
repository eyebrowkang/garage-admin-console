/**
 * Shared size thresholds for the Bucket Backend API.
 *
 * The split is the same on both sides of the wire:
 *   - Files below LARGE_FILE_THRESHOLD_BYTES go through the BFF proxy:
 *     POST /upload (multipart/form-data) for uploads, GET /download for
 *     downloads. The BFF holds the S3 credentials.
 *   - Files at or above the threshold go directly browser ↔ S3 via
 *     presigned URLs: POST /multipart/* for uploads, POST /presign
 *     (operation=getObject) for downloads. The S3 credentials are never
 *     sent to the browser.
 *
 * MULTIPART_PART_SIZE_BYTES is the recommended part size returned to
 * clients by POST /multipart/create. S3 requires every part except the
 * last to be at least 5 MiB; 8 MiB gives a comfortable buffer and keeps
 * the part count low for typical files.
 */

export const LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MULTIPART_MAX_PARTS = 10_000;
