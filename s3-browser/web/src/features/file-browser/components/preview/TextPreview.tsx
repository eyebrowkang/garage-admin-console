import { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@garage/ui';
import type { AxiosInstance } from 'axios';

const RENDER_MAX_BYTES = 1_000_000; // 1 MB soft limit

interface TextPreviewProps {
  fileKey: string;
  http: AxiosInstance;
  forceText?: boolean;
}

export function TextPreview({ fileKey, http, forceText }: TextPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    http
      .get('/download', {
        params: { key: fileKey },
        responseType: 'arraybuffer',
        headers: expanded ? undefined : { Range: `bytes=0-${RENDER_MAX_BYTES - 1}` },
        validateStatus: (s) => s < 400,
      })
      .then((res) => {
        if (cancelled) return;
        const buf = res.data as ArrayBuffer;
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        const isTruncated = !expanded && (res.status === 206 || buf.byteLength >= RENDER_MAX_BYTES);
        setContent(text);
        setTruncated(isTruncated);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message || 'Failed to load preview');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, fileKey, http]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading preview…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
        <AlertCircle size={16} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {forceText && (
        <p className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded px-2 py-1">
          Rendering as plain text. Binary content may appear as unreadable characters.
        </p>
      )}
      <pre className="max-h-[68vh] overflow-auto rounded-md border border-border bg-card p-4 font-mono text-[12px] leading-relaxed text-foreground whitespace-pre-wrap break-all">
        {content}
      </pre>
      {truncated && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-[12px] text-muted-foreground">
          <span>Preview truncated at 1 MB.</span>
          <Button variant="outline" size="sm" className="h-7" onClick={() => setExpanded(true)}>
            View more
          </Button>
        </div>
      )}
    </div>
  );
}
