import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

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

  const chartData = [
    { value: totalUp, name: 'Up', itemStyle: { color: '#22c55e' } },
    { value: totalDraining, name: 'Draining', itemStyle: { color: '#f59e0b' } },
    { value: totalDown, name: 'Down', itemStyle: { color: '#ef4444' } },
  ].filter((d) => d.value > 0);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: false,
          },
        },
        data: chartData,
      },
    ],
    graphic: {
      type: 'text',
      left: 'center',
      top: 'center',
      style: {
        text: `${total}\nNodes`,
        fill: '#334155',
        fontSize: 16,
        fontWeight: 'bold',
      } as const,
    },
  };

  return (
    <div className="space-y-4">
      {/* Donut chart */}
      <ReactECharts option={option} style={{ height: '160px' }} />

      {/* Legend */}
      <div className="flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Up</span>
          <span className="font-semibold">{totalUp}</span>
        </div>
        {totalDraining > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Draining</span>
            <span className="font-semibold">{totalDraining}</span>
          </div>
        )}
        {totalDown > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Down</span>
            <span className="font-semibold">{totalDown}</span>
          </div>
        )}
      </div>

      {/* Per-cluster breakdown (only if multiple clusters) */}
      {data.length > 1 && (
        <div className="space-y-2 pt-2 border-t">
          {data.map((cluster) => {
            const clusterTotal = cluster.up + cluster.down + cluster.draining;
            if (clusterTotal === 0) return null;

            return (
              <div key={cluster.clusterName} className="flex items-center gap-3">
                <span className="text-sm font-medium truncate flex-1">{cluster.clusterName}</span>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-green-600 font-medium">{cluster.up}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-muted-foreground">{clusterTotal}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
