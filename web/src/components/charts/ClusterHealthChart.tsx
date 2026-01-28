import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface ClusterHealthChartProps {
  healthy: number;
  degraded: number;
  unavailable: number;
}

export function ClusterHealthChart({ healthy, degraded, unavailable }: ClusterHealthChartProps) {
  const total = healthy + degraded + unavailable;

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      data: ['Healthy', 'Degraded', 'Unavailable'],
    },
    series: [
      {
        name: 'Cluster Health',
        type: 'pie',
        radius: ['50%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'center',
          formatter: () => `${total}\nClusters`,
          fontSize: 16,
          fontWeight: 'bold',
          lineHeight: 22,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 18,
            fontWeight: 'bold',
          },
        },
        labelLine: {
          show: false,
        },
        data: [
          {
            value: healthy,
            name: 'Healthy',
            itemStyle: { color: '#22c55e' },
          },
          {
            value: degraded,
            name: 'Degraded',
            itemStyle: { color: '#f59e0b' },
          },
          {
            value: unavailable,
            name: 'Unavailable',
            itemStyle: { color: '#ef4444' },
          },
        ].filter((d) => d.value > 0),
      },
    ],
  };

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        No clusters configured
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: '200px' }} />;
}
