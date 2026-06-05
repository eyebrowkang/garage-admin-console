import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Menu } from 'lucide-react';
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@garage/ui';
import { NodeIcon } from '@/lib/entity-icons';
import { useClusters } from '@/hooks/useClusters';
import { useBlockErrors } from '@/hooks/useBlocks';
import { ClusterNavList } from './ClusterNav';

/** Mobile cluster navigation: a hamburger (placed left of the global logo) that
 * opens a left drawer with the cluster identity + nav. Mounted by MainLayout only
 * on cluster routes, so its react-query reads (cluster name, block-error badge)
 * reuse the same cached queries the cluster pages already issued. */
export function ClusterMobileNav({ clusterId }: { clusterId: string }) {
  const [open, setOpen] = useState(false);
  const { data: clusters } = useClusters();
  const { data: blockErrorsData } = useBlockErrors(clusterId);

  const cluster = clusters?.find((c) => c.id === clusterId);
  const blockErrorCount = blockErrorsData
    ? Object.values(blockErrorsData.success).reduce(
        (sum, data) => sum + (data.blockErrors?.length || 0),
        0,
      )
    : 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open cluster navigation"
          className="-ml-1 shrink-0 text-muted-foreground hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} className="w-72 p-0 sm:max-w-72">
        <SheetTitle className="sr-only">Cluster navigation</SheetTitle>
        <div className="flex h-full flex-col">
          <div className="border-b px-4 pb-4 pt-5">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              All clusters
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <NodeIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-semibold leading-tight">
                  {cluster?.name || 'Loading...'}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{cluster?.endpoint}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ClusterNavList
              clusterId={clusterId}
              blockErrorCount={blockErrorCount}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
