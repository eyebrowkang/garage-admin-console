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

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: ['Up', 'Down', 'Draining'],
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.clusterName),
      axisLabel: {
        rotate: data.length > 4 ? 45 : 0,
        fontSize: 11,
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
    },
    series: [
      {
        name: 'Up',
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: data.map((d) => d.up),
        itemStyle: { color: '#22c55e' },
      },
      {
        name: 'Down',
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: data.map((d) => d.down),
        itemStyle: { color: '#ef4444' },
      },
      {
        name: 'Draining',
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: data.map((d) => d.draining),
        itemStyle: { color: '#f59e0b' },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: '250px' }} />;
}
