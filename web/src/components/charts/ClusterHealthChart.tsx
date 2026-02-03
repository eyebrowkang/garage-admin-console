import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface ClusterHealthChartProps {
  healthy: number;
  degraded: number;
  unavailable: number;
}

export function ClusterHealthChart({ healthy, degraded, unavailable }: ClusterHealthChartProps) {
  const total = healthy + degraded + unavailable;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        No clusters configured
      </div>
    );
  }

  const healthyPercentage = (healthy / total) * 100;
  const degradedPercentage = (degraded / total) * 100;
  const unavailablePercentage = (unavailable / total) * 100;

  return (
    <div className="space-y-6">
      {/* Total count display */}
      <div className="text-center py-4">
        <div className="text-5xl font-bold text-slate-900">{total}</div>
        <div className="text-sm text-muted-foreground mt-1">Total Clusters</div>
      </div>

      {/* Status bars */}
      <div className="space-y-3">
        {/* Healthy */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium text-slate-700">Healthy</span>
            </div>
            <span className="font-semibold text-slate-900">
              {healthy} ({healthyPercentage.toFixed(0)}%)
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500 rounded-full"
              style={{ width: `${healthyPercentage}%` }}
            />
          </div>
        </div>

        {/* Degraded */}
        {degraded > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-slate-700">Degraded</span>
              </div>
              <span className="font-semibold text-slate-900">
                {degraded} ({degradedPercentage.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{ width: `${degradedPercentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Unavailable */}
        {unavailable > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="font-medium text-slate-700">Unavailable</span>
              </div>
              <span className="font-semibold text-slate-900">
                {unavailable} ({unavailablePercentage.toFixed(0)}%)
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-500 rounded-full"
                style={{ width: `${unavailablePercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
