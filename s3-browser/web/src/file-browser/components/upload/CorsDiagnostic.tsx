/**
 * CORS diagnostic — surfaced in the upload panel when a direct-to-S3 upload
 * fails, since a bucket CORS misconfiguration is the usual (and otherwise
 * opaque) cause. On demand it calls the read-only GET /cors-status and explains
 * whether CORS is the problem and how to fix it.
 *
 * Palette: purple/`warning` for "needs attention / may still work" (the
 * non-error caution color), green for "looks fine", red only for a hard error.
 */
import { useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@garage/ui';
import { useBrowser } from '../../context';

interface CorsStatusResponse {
  sufficient: boolean;
  reason: 'ok' | 'no-config' | 'insufficient' | 'unreadable';
  checkedOrigins: string[];
  recommendedRule: unknown;
}

export function CorsDiagnostic() {
  const { http } = useBrowser();
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [result, setResult] = useState<CorsStatusResponse | null>(null);

  const run = async () => {
    setState('loading');
    try {
      const res = await http.get<CorsStatusResponse>('/cors-status');
      setResult(res.data);
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  if (!result) {
    return (
      <div className="border-t border-border/70 bg-warning/5 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Upload failing? For direct-to-S3 uploads, a bucket CORS misconfiguration is the usual
          cause.
        </p>
        <Button
          variant="outline"
          className="mt-1.5 h-7 px-2 text-[11px]"
          onClick={run}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Checking…
            </>
          ) : (
            'Check bucket CORS'
          )}
        </Button>
        {state === 'failed' && (
          <p className="mt-1 text-[11px] text-destructive">Couldn’t reach the CORS check.</p>
        )}
      </div>
    );
  }

  if (result.sufficient) {
    return (
      <div className="flex items-start gap-1.5 border-t border-border/70 bg-success/5 px-3 py-2 text-[11px] text-muted-foreground">
        <Check size={12} className="mt-0.5 shrink-0 text-success" />
        <span>Bucket CORS looks correct for browser uploads — the failure may be transient.</span>
      </div>
    );
  }

  const message =
    result.reason === 'unreadable'
      ? 'Couldn’t read the bucket’s CORS rules (the key may lack permission, or the endpoint doesn’t expose them). Uploads may still work on some endpoints; if they keep failing, apply this rule:'
      : 'The bucket is missing the CORS rule browser uploads need. Ask an admin to apply this rule:';

  return (
    <div className="border-t border-border/70 bg-warning/5 px-3 py-2">
      <div className="flex items-start gap-1.5 text-[11px] text-warning">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-muted px-2 py-1 text-[10px] leading-snug text-foreground">
        {JSON.stringify(result.recommendedRule, null, 2)}
      </pre>
    </div>
  );
}
