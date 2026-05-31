import { createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  LinkExternalIcon,
  XIcon,
} from '@primer/octicons-react';
import { Button, cn } from '@garage/ui';
import { fileKind, formatBytes, formatDateTime, isTextLikeKind } from '@garage/web-shared';
import type { S3Object } from '@/lib/types';
import type { FileItem } from '../../types';
import { getFileKindIcon, iconBgClass, iconColorClass } from '../../icons';
import { useBrowser } from '../../context';
import { useDownload } from '../../hooks/useDownload';
import { TextPreview } from './TextPreview';
import type { AxiosInstance } from 'axios';

const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

export function PreviewPane() {
  const { activeFile } = useBrowser();
  if (!activeFile) return null;
  return <PreviewPaneInner key={activeFile.key} activeFile={activeFile} />;
}

function PreviewPaneInner({ activeFile }: { activeFile: FileItem }) {
  const { http, bucket, setActiveFile, showToast, openPresign } = useBrowser();
  const [forceText, setForceText] = useState(false);

  const name = activeFile.name;
  const object = activeFile.object;
  const kind = fileKind(name);
  const Icon = getFileKindIcon(kind, false);

  const metaQuery = useQuery({
    queryKey: ['object-meta', http.defaults.baseURL, object.key],
    queryFn: async () => {
      const res = await http.get<S3Object>('/object', { params: { key: object.key } });
      return res.data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const metadata = metaQuery.data ?? object;
  const canPreviewBySize = object.size <= MAX_PREVIEW_BYTES;

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('ok', `${label} copied`);
    } catch {
      showToast('err', 'Clipboard unavailable');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card/20">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-5">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            iconBgClass[kind],
            iconColorClass[kind],
          )}
        >
          {createElement(Icon, { size: 16 })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground" title={name}>
            {name}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={object.key}>
            {object.key}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => openPresign(activeFile)}
        >
          <LinkExternalIcon size={14} />
          Share
        </Button>
        <DownloadButton
          fileKey={object.key}
          name={name}
          size={object.size}
          http={http}
          showToast={showToast}
        />
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          onClick={() => setActiveFile(null)}
          title="Close preview"
          aria-label="Close preview"
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid min-h-full gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <PreviewContent
              fileKey={object.key}
              name={name}
              size={object.size}
              http={http}
              forceText={forceText}
              onForceText={() => setForceText(true)}
            />
          </section>

          <aside className="space-y-5">
            {metaQuery.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Metadata refresh failed. Showing listing metadata.
              </div>
            )}

            <MetadataPanel bucket={bucket} object={metadata} listingSize={object.size} />

            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Copy
              </p>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => copyText('S3 URI', `s3://${bucket}/${object.key}`)}
                >
                  <CopyIcon size={14} /> Copy S3 URI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => copyText('Key', object.key)}
                >
                  <CopyIcon size={14} /> Copy key
                </Button>
              </div>
            </section>

            {canPreviewBySize && !forceText && !isTextLikeKind(kind) && kind !== 'image' && (
              <section className="rounded-md border border-border bg-muted/25 p-3">
                <p className="text-xs text-muted-foreground">
                  This type is not previewed automatically. You can still render it as text; binary
                  bytes may appear as unreadable characters.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full justify-start gap-2"
                  onClick={() => setForceText(true)}
                >
                  <EyeIcon size={14} />
                  View as plain text
                </Button>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function PreviewContent({
  fileKey,
  name,
  size,
  http,
  forceText,
  onForceText,
}: {
  fileKey: string;
  name: string;
  size: number;
  http: AxiosInstance;
  forceText: boolean;
  onForceText: () => void;
}) {
  const kind = fileKind(name);
  const tooLarge = size > MAX_PREVIEW_BYTES;

  if (tooLarge) {
    return (
      <NoPreview
        title="Preview disabled"
        message={`This object is ${formatBytes(size)}. Files over 10 MB are not fetched for preview.`}
      />
    );
  }

  if (forceText) {
    return <TextPreview fileKey={fileKey} http={http} forceText />;
  }

  if (kind === 'image') {
    return <ImagePreview fileKey={fileKey} http={http} />;
  }

  if (isTextLikeKind(kind)) {
    return <TextPreview fileKey={fileKey} http={http} />;
  }

  return (
    <NoPreview
      title="No automatic preview"
      message="This object type is unknown, so no object bytes were fetched."
      action={
        <Button variant="outline" size="sm" onClick={onForceText}>
          <EyeIcon size={14} />
          View as plain text
        </Button>
      }
    />
  );
}

function NoPreview({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <AlertIcon size={22} />
      </div>
      <div className="max-w-md">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {action}
    </div>
  );
}

function MetadataPanel({
  bucket,
  object,
  listingSize,
}: {
  bucket: string;
  object: S3Object;
  listingSize: number;
}) {
  const rows = useMemo(
    () => [
      ['Bucket', bucket],
      ['Key', object.key],
      ['Size', formatBytes(object.size ?? listingSize)],
      ['Content-Type', object.contentType ?? '—'],
      ['Last Modified', formatDateTime(object.lastModified)],
      ['ETag', object.etag || '—'],
      ['Storage Class', object.storageClass ?? '—'],
    ],
    [bucket, listingSize, object],
  );

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Details
      </p>
      <dl className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-3 py-2.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ImagePreview({ fileKey, http }: { fileKey: string; http: AxiosInstance }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    http
      .get('/download', { params: { key: fileKey }, responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(r.data as Blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileKey, http]);

  if (error) {
    return (
      <NoPreview
        title="Image failed to load"
        message="The backend download request for this image failed."
      />
    );
  }

  if (!url) {
    return (
      <div className="flex min-h-[340px] items-center justify-center rounded-md border border-border bg-muted/20 text-sm text-muted-foreground">
        Loading image…
      </div>
    );
  }

  return (
    <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20 p-4">
      <img
        src={url}
        alt=""
        className="max-h-[68vh] max-w-full object-contain"
        onError={() => setError(true)}
      />
    </div>
  );
}

function DownloadButton({
  fileKey,
  name,
  size,
  http,
  showToast,
}: {
  fileKey: string;
  name: string;
  size: number;
  http: AxiosInstance;
  showToast: (kind: 'ok' | 'err', msg: string) => void;
}) {
  const download = useDownload(http, (msg) => showToast('err', msg));

  const handleDownload = async () => {
    await download(fileKey, name, size);
  };

  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleDownload}>
      <DownloadIcon size={14} /> Download
    </Button>
  );
}
