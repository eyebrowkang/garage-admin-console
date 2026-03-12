import { Suspense, type ComponentType, type ReactNode, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Skeleton,
} from '@garage-admin/ui';
import { FolderOpen } from 'lucide-react';
import { MFErrorBoundary } from '@/components/MFErrorBoundary';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { formatShortId } from '@/lib/format';
import type { BucketKeyPerm } from '@/types/garage';

interface EmbeddedBrowserConfig {
  apiBase: string;
  bucket: string;
  connectionId: string;
  readonly: boolean;
  token: string;
}

interface BridgeConnectionResponse {
  bucketName: string;
  connectionId: string;
  token: string;
}

interface ConnectToBucketBrowserInput {
  accessKeyId: string;
  bucketId: string;
  clusterId: string;
}

interface EmbedProviderProps {
  config: EmbeddedBrowserConfig;
  children: ReactNode;
}

interface BucketObjectBrowserCardProps {
  bucketId: string;
  clusterId: string;
  keys: BucketKeyPerm[];
  connectToBucketBrowser?: (
    input: ConnectToBucketBrowserInput,
  ) => Promise<BridgeConnectionResponse>;
  EmbedProvider?: ComponentType<EmbedProviderProps>;
  ObjectBrowser?: ComponentType<{ bucket?: string }>;
}

function getAccessSummary(key: BucketKeyPerm | undefined) {
  if (!key) {
    return {
      description: 'Choose a readable access key. Write permission is optional for embedding.',
      title: 'Choose a session key',
    };
  }

  if (key.permissions.write) {
    return {
      description: 'This key can browse and change objects in this bucket.',
      title: 'Read + write session',
    };
  }

  return {
    description: 'This key can browse objects but cannot upload, rename, or delete.',
    title: 'Read-only session',
  };
}

function MissingEmbedProvider({ children }: EmbedProviderProps) {
  return <>{children}</>;
}

function MissingObjectBrowser(): never {
  throw new Error('S3 Browser components are unavailable');
}

async function defaultConnectToBucketBrowser({
  accessKeyId,
  bucketId,
  clusterId,
}: ConnectToBucketBrowserInput): Promise<BridgeConnectionResponse> {
  const response = await api.post<BridgeConnectionResponse>(`/s3-bridge/${clusterId}/connect`, {
    accessKeyId,
    bucketId,
  });

  return response.data;
}

export function BucketObjectBrowserCard({
  bucketId,
  clusterId,
  keys,
  connectToBucketBrowser = defaultConnectToBucketBrowser,
  EmbedProvider = MissingEmbedProvider,
  ObjectBrowser = MissingObjectBrowser,
}: BucketObjectBrowserCardProps) {
  const [browseConfig, setBrowseConfig] = useState<EmbeddedBrowserConfig | null>(null);
  const [browseKeyId, setBrowseKeyId] = useState('');
  const [browseConnecting, setBrowseConnecting] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [browserResetKey, setBrowserResetKey] = useState(0);

  const readableKeys = keys.filter((key) => key.permissions.read);
  const selectedKey = readableKeys.find((key) => key.accessKeyId === browseKeyId);
  const accessSummary = getAccessSummary(selectedKey);

  const handleBrowseConnect = async () => {
    if (!browseKeyId) {
      return;
    }

    if (!selectedKey) {
      return;
    }

    setBrowseConnecting(true);
    setBrowseError('');

    try {
      const response = await connectToBucketBrowser({
        accessKeyId: browseKeyId,
        bucketId,
        clusterId,
      });

      setBrowseConfig({
        apiBase: '/s3-api',
        bucket: response.bucketName,
        connectionId: response.connectionId,
        readonly: !selectedKey.permissions.write,
        token: response.token,
      });
      setBrowserResetKey((current) => current + 1);
    } catch (error) {
      setBrowseError(getApiErrorMessage(error));
    } finally {
      setBrowseConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setBrowseConfig(null);
    setBrowseError('');
    setBrowserResetKey((current) => current + 1);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Object Browser
            </CardTitle>
            <CardDescription>
              Browse and manage objects through the optional embedded S3 Browser.
            </CardDescription>
          </div>
          {browseConfig && (
            <Button variant="outline" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!browseConfig ? (
          <div className="space-y-4">
            {readableKeys.length === 0 ? (
              <Alert>
                <AlertTitle>Object browsing unavailable</AlertTitle>
                <AlertDescription>
                  This bucket does not have any access key with read permission. You can keep
                  managing the bucket here, then enable embedded browsing later if S3 Browser is
                  deployed.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="bucket-object-browser-access-key">Access Key</Label>
                    <Select
                      value={browseKeyId}
                      onValueChange={setBrowseKeyId}
                      disabled={browseConnecting}
                    >
                      <SelectTrigger
                        id="bucket-object-browser-access-key"
                        aria-label="Access Key"
                      >
                        <SelectValue placeholder="Select an access key" />
                      </SelectTrigger>
                      <SelectContent>
                        {readableKeys.map((key) => (
                          <SelectItem key={key.accessKeyId} value={key.accessKeyId}>
                            {key.name || formatShortId(key.accessKeyId, 12)}
                            {key.permissions.write ? ' (read + write)' : ' (read only)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full md:w-auto md:self-end"
                    onClick={handleBrowseConnect}
                    disabled={!browseKeyId || browseConnecting}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {browseConnecting ? 'Connecting...' : 'Browse Objects'}
                  </Button>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">{accessSummary.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{accessSummary.description}</p>
                </div>

                {browseError && (
                  <Alert variant="destructive">
                    <AlertTitle>Connection failed</AlertTitle>
                    <AlertDescription>{browseError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        ) : (
          <MFErrorBoundary resetKey={browserResetKey}>
            <Suspense
              fallback={
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Loading object browser...</p>
                    <p className="text-sm text-muted-foreground">
                      Preparing the embedded S3 session for {browseConfig.bucket}.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-40 w-full rounded-lg" />
                  </div>
                  <span className="sr-only">Loading Object Browser...</span>
                </div>
              }
            >
              <EmbedProvider config={browseConfig}>
                <ObjectBrowser bucket={browseConfig.bucket} />
              </EmbedProvider>
            </Suspense>
          </MFErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
