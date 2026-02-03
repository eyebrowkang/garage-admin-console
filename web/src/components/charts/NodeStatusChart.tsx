import { CheckCircle2, AlertTriangle, XCircle, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface NodeStatusData {
  clusterName: string;
  up: number;
  down: number;
  draining: number;
}

interface NodeStatusChartProps {
  data: NodeStatusData[];
}

export function NodeStatusChart({ data }: NodeStatusChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
        No cluster data available
      </div>
    );
  }

  // Calculate totals
  const totalUp = data.reduce((sum, d) => sum + d.up, 0);
  const totalDown = data.reduce((sum, d) => sum + d.down, 0);
  const totalDraining = data.reduce((sum, d) => sum + d.draining, 0);
  const total = totalUp + totalDown + totalDraining;

  const upPercentage = total > 0 ? (totalUp / total) * 100 : 0;
  const drainingPercentage = total > 0 ? (totalDraining / total) * 100 : 0;
  const downPercentage = total > 0 ? (totalDown / total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Total nodes display */}
      <div className="text-center py-4">
        <div className="text-5xl font-bold text-slate-900">{total}</div>
        <div className="text-sm text-muted-foreground mt-1">Total Nodes</div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="text-2xl font-bold text-green-700">{totalUp}</div>
          <div className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Online
          </div>
        </div>
        {totalDraining > 0 && (
          <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-2xl font-bold text-amber-700">{totalDraining}</div>
            <div className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Draining
            </div>
          </div>
        )}
        {totalDown > 0 && (
          <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="text-2xl font-bold text-red-700">{totalDown}</div>
            <div className="text-xs text-red-600 mt-1 flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" />
              Offline
            </div>
          </div>
        )}
      </div>

      {/* Stacked progress bar */}
      <div className="space-y-2">
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          {totalUp > 0 && (
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${upPercentage}%` }}
              title={`${totalUp} online (${upPercentage.toFixed(0)}%)`}
            />
          )}
          {totalDraining > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${drainingPercentage}%` }}
              title={`${totalDraining} draining (${drainingPercentage.toFixed(0)}%)`}
            />
          )}
          {totalDown > 0 && (
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${downPercentage}%` }}
              title={`${totalDown} offline (${downPercentage.toFixed(0)}%)`}
            />
          )}
        </div>
      </div>

      {/* Per-cluster breakdown with scroll */}
      {data.length > 0 && (
        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            By Cluster
          </div>
          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
            {data.map((cluster) => {
              const clusterTotal = cluster.up + cluster.down + cluster.draining;
              if (clusterTotal === 0) return null;

              const clusterUpPct = (cluster.up / clusterTotal) * 100;
              const clusterDrainingPct = (cluster.draining / clusterTotal) * 100;
              const clusterDownPct = (cluster.down / clusterTotal) * 100;

              const status =
                cluster.down > 0
                  ? 'critical'
                  : cluster.draining > 0
                    ? 'warning'
                    : 'healthy';

              return (
                <div
                  key={cluster.clusterName}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Server className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-sm font-medium truncate">{cluster.clusterName}</span>
                    </div>
                    <Badge
                      variant={
                        status === 'healthy'
                          ? 'success'
                          : status === 'warning'
                            ? 'warning'
                            : 'destructive'
                      }
                      className="text-xs shrink-0 ml-2"
                    >
                      {cluster.up}/{clusterTotal}
                    </Badge>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                    {cluster.up > 0 && (
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${clusterUpPct}%` }}
                      />
                    )}
                    {cluster.draining > 0 && (
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${clusterDrainingPct}%` }}
                      />
                    )}
                    {cluster.down > 0 && (
                      <div
                        className="h-full bg-red-500"
                        style={{ width: `${clusterDownPct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
