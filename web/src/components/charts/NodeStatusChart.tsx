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

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">{totalUp}</div>
          <div className="text-xs text-muted-foreground">Up</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-500">{totalDown}</div>
          <div className="text-xs text-muted-foreground">Down</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-500">{totalDraining}</div>
          <div className="text-xs text-muted-foreground">Draining</div>
        </div>
      </div>

      {/* Overall progress bar */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
            {totalUp > 0 && (
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(totalUp / total) * 100}%` }}
              />
            )}
            {totalDraining > 0 && (
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(totalDraining / total) * 100}%` }}
              />
            )}
            {totalDown > 0 && (
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${(totalDown / total) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{total} total nodes</span>
            <span>{total > 0 ? Math.round((totalUp / total) * 100) : 0}% healthy</span>
          </div>
        </div>
      )}

      {/* Per-cluster breakdown */}
      <div className="space-y-3 pt-2">
        {data.map((cluster) => {
          const clusterTotal = cluster.up + cluster.down + cluster.draining;
          if (clusterTotal === 0) return null;

          return (
            <div key={cluster.clusterName} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium truncate">{cluster.clusterName}</span>
                <span className="text-muted-foreground">
                  {cluster.up}/{clusterTotal}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
                {cluster.up > 0 && (
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${(cluster.up / clusterTotal) * 100}%` }}
                  />
                )}
                {cluster.draining > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${(cluster.draining / clusterTotal) * 100}%` }}
                  />
                )}
                {cluster.down > 0 && (
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(cluster.down / clusterTotal) * 100}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
