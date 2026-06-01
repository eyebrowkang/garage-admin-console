import { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  DialogFooter,
  Input,
  Label,
} from '@garage/ui';

import { api } from '@/lib/api';

export interface ConnectionFormData {
  name: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const EMPTY_FORM: ConnectionFormData = {
  name: '',
  endpoint: '',
  region: 'us-east-1',
  forcePathStyle: true,
  accessKeyId: '',
  secretAccessKey: '',
  bucket: '',
};

export const normalizeEndpoint = (value: string) => value.trim().replace(/\/+$/, '');

interface ConnectionFormProps {
  initial: ConnectionFormData;
  mode: 'create' | 'edit';
  error: string;
  busy: boolean;
  onSubmit: (data: ConnectionFormData) => void;
}

export function ConnectionForm({ initial, mode, error, busy, onSubmit }: ConnectionFormProps) {
  const [form, setForm] = useState(initial);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'err'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const isEdit = mode === 'edit';
  const canSubmit =
    form.name.trim() &&
    form.endpoint.trim() &&
    (isEdit ? true : form.accessKeyId.trim() && form.secretAccessKey.trim());
  const canTest = form.endpoint.trim() && form.accessKeyId.trim() && form.secretAccessKey.trim();

  const handleTest = async () => {
    if (!canTest) return;
    setTestState('testing');
    setTestMsg('');
    try {
      const res = await api.post<{ ok: boolean; buckets?: number; error?: string }>(
        '/connections/test',
        {
          endpoint: normalizeEndpoint(form.endpoint),
          region: form.region,
          forcePathStyle: form.forcePathStyle,
          accessKeyId: form.accessKeyId,
          secretAccessKey: form.secretAccessKey,
          bucket: form.bucket.trim() || undefined,
        },
      );
      if (res.data.ok) {
        setTestState('ok');
        setTestMsg(`Connected - ${res.data.buckets ?? 0} bucket(s) visible`);
      } else {
        setTestState('err');
        setTestMsg(res.data.error ?? 'Unreachable');
      }
    } catch (err) {
      setTestState('err');
      setTestMsg((err as Error).message || 'Test failed');
    }
  };

  return (
    <>
      <div className="max-h-[min(70vh,560px)] overflow-y-auto pr-1">
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="conn-name">Friendly Name</Label>
            <Input
              id="conn-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Production Garage"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-endpoint">Endpoint URL</Label>
            <Input
              id="conn-endpoint"
              value={form.endpoint}
              placeholder="https://s3.example.com"
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="conn-region">Region</Label>
              <Input
                id="conn-region"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                <Checkbox
                  checked={form.forcePathStyle}
                  onCheckedChange={(checked) => setForm({ ...form, forcePathStyle: checked })}
                  aria-label="Path-style addressing"
                />
                Path-style addressing
              </label>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-key">Access Key ID{isEdit ? ' (optional)' : ''}</Label>
            <Input
              id="conn-key"
              value={form.accessKeyId}
              placeholder={isEdit ? 'Leave blank to keep existing' : 'AKIA...'}
              onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-secret">Secret Access Key{isEdit ? ' (optional)' : ''}</Label>
            <Input
              id="conn-secret"
              type="password"
              value={form.secretAccessKey}
              placeholder={isEdit ? 'Leave blank to keep existing' : ''}
              onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conn-bucket">Bucket (optional)</Label>
            <Input
              id="conn-bucket"
              value={form.bucket}
              placeholder="my-bucket"
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to list every bucket the key can see. Set a bucket name when the key has
              no <code className="font-mono">ListBuckets</code> permission.
            </p>
          </div>
          {testState !== 'idle' && (
            <Alert variant={testState === 'err' ? 'destructive' : 'default'}>
              <AlertDescription>
                {testState === 'testing' ? 'Testing connection...' : testMsg}
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!canTest || testState === 'testing' || busy}
        >
          {testState === 'testing' ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button onClick={() => onSubmit(form)} disabled={!canSubmit || busy}>
          {busy ? (isEdit ? 'Saving...' : 'Connecting...') : isEdit ? 'Save Changes' : 'Connect'}
        </Button>
      </DialogFooter>
    </>
  );
}
