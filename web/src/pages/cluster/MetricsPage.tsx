import { useClusterContext } from '@/contexts/ClusterContext';
import { MetricsDisplay } from '@/components/charts/MetricsDisplay';

export function MetricsPage() {
  const { clusterId } = useClusterContext();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Prometheus Metrics</h2>
        <p className="text-muted-foreground">
          Raw metrics data from the cluster in Prometheus format
        </p>
      </div>
      <MetricsDisplay clusterId={clusterId} />
    </div>
  );
}
