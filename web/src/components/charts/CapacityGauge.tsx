import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { formatBytes } from '@/lib/format';

interface CapacityGaugeProps {
  used: number;
  total: number;
  label?: string;
}

export function CapacityGauge({ used, total, label = 'Capacity' }: CapacityGaugeProps) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

  // Color based on usage
  const getColor = (pct: number) => {
    if (pct >= 90) return '#ef4444';
    if (pct >= 75) return '#f59e0b';
    return '#22c55e';
  };

  const option: EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        splitNumber: 4,
        itemStyle: {
          color: getColor(percentage),
        },
        progress: {
          show: true,
          roundCap: true,
          width: 12,
        },
        pointer: {
          show: false,
        },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 12,
            color: [[1, '#e5e7eb']],
          },
        },
        axisTick: {
          show: false,
        },
        splitLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        title: {
          show: true,
          offsetCenter: [0, '30%'],
          fontSize: 12,
          color: '#6b7280',
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '-10%'],
          fontSize: 24,
          fontWeight: 'bold',
          formatter: `${percentage}%`,
          color: getColor(percentage),
        },
        data: [
          {
            value: percentage,
            name: label,
          },
        ],
      },
    ],
  };

  return (
    <div>
      <ReactECharts option={option} style={{ height: '160px' }} />
      <div className="text-center -mt-4 text-sm text-muted-foreground">
        {formatBytes(used)} / {formatBytes(total)}
      </div>
    </div>
  );
}
