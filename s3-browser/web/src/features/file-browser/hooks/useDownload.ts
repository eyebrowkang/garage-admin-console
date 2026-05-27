import { useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import { basename } from '@/lib/format';

export async function downloadObject(http: AxiosInstance, key: string, filename = basename(key)) {
  const res = await http.get('/download', {
    params: { key },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useDownload(http: AxiosInstance, onError: (msg: string) => void) {
  return useCallback(
    async (key: string, filename?: string) => {
      try {
        await downloadObject(http, key, filename);
      } catch (err) {
        onError((err as Error).message || 'Download failed');
      }
    },
    [http, onError],
  );
}
