import { useS3EmbedContext } from '../providers/S3EmbedProvider';
import { ObjectBrowser } from './ObjectBrowser';

export function BucketExplorer() {
  const embedConfig = useS3EmbedContext();
  const isEmbedded = embedConfig !== null;

  return (
    <div className="space-y-6">
      {!isEmbedded && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Buckets</h2>
          <p className="text-gray-400">Bucket list coming soon.</p>
        </div>
      )}
      <ObjectBrowser bucket={embedConfig?.bucket} />
    </div>
  );
}
