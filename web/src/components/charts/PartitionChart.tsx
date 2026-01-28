import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface PartitionChartProps {
  allOk: number;
  quorumOk: number;
  degraded: number;
  total: number;
}

export function PartitionChart({ allOk, quorumOk, degraded, total }: PartitionChartProps) {
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[180px] text-muted-foreground">
        No partition data
      </div>
    );
  }

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    series: [
      {
        name: 'Partition Health',
        type: 'pie',
        radius: ['40%', '70%'],
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
            show: true,
            fontSize: 12,
            fontWeight: 'bold',
          },
        },
        labelLine: {
          show: false,
        },
        data: [
          {
            value: allOk,
            name: 'All OK',
            itemStyle: { color: '#22c55e' },
          },
          {
            value: quorumOk,
            name: 'Quorum OK',
            itemStyle: { color: '#3b82f6' },
          },
          {
            value: degraded,
            name: 'Degraded',
            itemStyle: { color: '#ef4444' },
          },
        ].filter((d) => d.value > 0),
      },
    ],
  };

  return (
    <div>
      <ReactECharts option={option} style={{ height: '150px' }} />
      <div className="flex justify-center gap-4 text-xs mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span>All OK ({allOk})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Quorum ({quorumOk})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>Degraded ({degraded})</span>
        </div>
      </div>
    </div>
  );
}
