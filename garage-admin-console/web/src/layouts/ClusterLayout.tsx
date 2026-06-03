import { Suspense } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { useClusters } from '@/hooks/useClusters';
import { useBlockErrors } from '@/hooks/useBlocks';
import { ClusterContext } from '@/contexts/ClusterContext';
import { PageLoadingState } from '@garage/ui';
import { ClusterSidebar } from '@/components/cluster/ClusterSidebar';

export function ClusterLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: clusters } = useClusters();
  const { data: blockErrorsData } = useBlockErrors(id || '');

  if (!id) {
    return <div className="p-4">Invalid cluster ID</div>;
  }

  const cluster = clusters?.find((c) => c.id === id);

  // Count total block errors across all nodes (drives the Blocks nav badge).
  const blockErrorCount = blockErrorsData
    ? Object.values(blockErrorsData.success).reduce(
        (sum, data) => sum + (data.blockErrors?.length || 0),
        0,
      )
    : 0;

  return (
    <ClusterContext.Provider value={{ clusterId: id, cluster }}>
      <div className="flex flex-col lg:flex-row lg:gap-6">
        {/* Desktop: collapsible, persistent sidebar. On mobile, navigation lives
            in the global header's hamburger drawer (see ClusterMobileNav). */}
        <ClusterSidebar
          clusterId={id}
          clusterName={cluster?.name}
          endpoint={cluster?.endpoint}
          blockErrorCount={blockErrorCount}
        />

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={<PageLoadingState label="Loading..." />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </ClusterContext.Provider>
  );
}
