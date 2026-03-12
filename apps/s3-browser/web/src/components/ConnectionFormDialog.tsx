import { useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@garage-admin/ui';

export interface ConnectionFormData {
  name: string;
  endpoint: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  pathStyle: boolean;
}

interface ConnectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ConnectionFormData) => void;
  isLoading: boolean;
  initialData?: {
    name: string;
    endpoint: string;
    region: string | null;
    bucket: string | null;
    pathStyle: boolean;
  };
}

export function ConnectionFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialData,
}: ConnectionFormDialogProps) {
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name ?? '');
  const [endpoint, setEndpoint] = useState(initialData?.endpoint ?? '');
  const [region, setRegion] = useState(initialData?.region ?? '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [bucket, setBucket] = useState(initialData?.bucket ?? '');
  const [pathStyle, setPathStyle] = useState(initialData?.pathStyle ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: ConnectionFormData = {
      name,
      endpoint,
      pathStyle,
    };
    if (region) data.region = region;
    if (bucket) data.bucket = bucket;

    if (isEdit) {
      // Only include credentials if user entered them
      if (accessKeyId) data.accessKeyId = accessKeyId;
      if (secretAccessKey) data.secretAccessKey = secretAccessKey;
    } else {
      data.accessKeyId = accessKeyId;
      data.secretAccessKey = secretAccessKey;
    }

    onSubmit(data);
  };

  const isValid = isEdit
    ? name.trim() && endpoint.trim()
    : name.trim() && endpoint.trim() && accessKeyId.trim() && secretAccessKey.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Connection' : 'Add Connection'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update your S3 connection settings. Leave credential fields empty to keep existing values.'
              : 'Connect to an S3-compatible storage service.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conn-name">Connection Name</Label>
            <Input
              id="conn-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My S3 Storage"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-endpoint">Endpoint URL</Label>
            <Input
              id="conn-endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://s3.example.com"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-region">
              Region <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="conn-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              className="h-10"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="conn-access-key">
                Access Key ID{' '}
                {isEdit && <span className="text-muted-foreground">(leave empty to keep)</span>}
              </Label>
              <Input
                id="conn-access-key"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'AKIAIOSFODNN7EXAMPLE'}
                className="h-10 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-secret-key">
                Secret Access Key{' '}
                {isEdit && <span className="text-muted-foreground">(leave empty to keep)</span>}
              </Label>
              <Input
                id="conn-secret-key"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Enter secret key'}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-bucket">
              Bucket Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="conn-bucket"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-bucket"
              className="h-10"
            />
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                If specified, the connection opens directly to this bucket. If left empty, you can
                browse all buckets accessible with the provided credentials.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <input
              id="conn-path-style"
              type="checkbox"
              checked={pathStyle}
              onChange={(e) => setPathStyle(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <Label htmlFor="conn-path-style" className="font-normal leading-relaxed">
              Use path-style addressing
              <span className="ml-1 inline text-muted-foreground">
                Recommended for most S3-compatible services.
              </span>
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Updating...' : 'Creating...'}
                </>
              ) : isEdit ? (
                'Update Connection'
              ) : (
                'Add Connection'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
