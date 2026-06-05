import { useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import { basename } from '@garage/web-shared';
import { LARGE_FILE_THRESHOLD_BYTES } from '@/lib/multipart-upload';

interface ObjectMetadata {
  size: number;
}

interface PresignResponse {
  url: string;
  expiresAt: string;
}

function clickDownloadAnchor(url: string, filename: string, sameOrigin: boolean) {
  const a = document.createElement('a');
  a.href = url;
  // The `download` attribute is ignored cross-origin — we rely on the
  // ResponseContentDisposition header attached to the presigned URL there.
  if (sameOrigin) a.download = filename;
  // Open in a new tab for cross-origin so the SPA stays mounted while S3
  // handles the response; with Content-Disposition: attachment the tab
  // never actually renders.
  if (!sameOrigin) a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function resolveSize(http: AxiosInstance, key: string): Promise<number> {
  const res = await http.get<ObjectMetadata>('/object', { params: { key } });
  return res.data.size;
}

export async function downloadObject(
  http: AxiosInstance,
  key: string,
  filename: string = basename(key),
  knownSize?: number,
) {
  const size = knownSize ?? (await resolveSize(http, key));

  if (size >= LARGE_FILE_THRESHOLD_BYTES) {
    // Large file: presigned URL, browser fetches directly from S3.
    const res = await http.post<PresignResponse>('/presign', {
      key,
      operation: 'getObject',
      expiresIn: 900,
      responseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    clickDownloadAnchor(res.data.url, filename, false);
    return;
  }

  // Small file: proxy through BFF, no credentials leak.
  const res = await http.get('/download', { params: { key }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  try {
    clickDownloadAnchor(url, filename, true);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useDownload(http: AxiosInstance, onError: (msg: string) => void) {
  return useCallback(
    async (key: string, filename?: string, knownSize?: number) => {
      try {
        await downloadObject(http, key, filename, knownSize);
      } catch (err) {
        onError((err as Error).message || 'Download failed');
      }
    },
    [http, onError],
  );
}
