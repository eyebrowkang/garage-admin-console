import { useS3EmbedContext } from '../providers/S3EmbedProvider';

export function ObjectBrowser({ bucket }: { bucket?: string }) {
  const embedConfig = useS3EmbedContext();
  const isEmbedded = embedConfig !== null;
  const activeBucket = bucket ?? embedConfig?.bucket ?? 'none';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold">Object Browser</h2>
      <div className="text-sm text-gray-500">
        <p>
          Bucket: <span className="font-mono">{activeBucket}</span>
        </p>
        <p>Mode: {isEmbedded ? 'Embedded' : 'Standalone'}</p>
        {isEmbedded && (
          <p>
            API Base: <span className="font-mono">{embedConfig.apiBase}</span>
          </p>
        )}
      </div>
      <p className="mt-4 text-gray-400">Object list and management UI coming soon.</p>
    </div>
  );
}
