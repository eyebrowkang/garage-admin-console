import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BucketList } from './cluster/BucketList';
import { KeyList } from './cluster/KeyList';
import { ClusterNodeList } from './cluster/NodeList';
import { ClusterOverview } from './cluster/ClusterOverview';
import { LayoutManager } from './cluster/LayoutManager';
import { ApiExplorer } from './cluster/ApiExplorer';
import { api } from '@/lib/api';
import type { ClusterSummary } from '@/types/garage';

export default function ClusterDetail() {
  const { id } = useParams();

  const { data: clusters } = useQuery<ClusterSummary[]>({
    queryKey: ['clusters'],
    queryFn: async () => {
      const res = await api.get<ClusterSummary[]>('/clusters');
      return res.data;
    },
    enabled: Boolean(id),
  });

  if (!id) return <div>Invalid Cluster ID</div>;

  const cluster = clusters?.find((item) => item.id === id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {cluster?.name || 'Cluster Management'}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground mt-1">
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-600">
              {id}
            </span>
            {cluster?.endpoint && (
              <span className="text-xs text-slate-500">{cluster.endpoint}</span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-slate-100/50 p-1 border flex flex-wrap">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="buckets"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Buckets
          </TabsTrigger>
          <TabsTrigger
            value="keys"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Access Keys
          </TabsTrigger>
          <TabsTrigger
            value="nodes"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Nodes
          </TabsTrigger>
          <TabsTrigger
            value="layout"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            Layout
          </TabsTrigger>
          <TabsTrigger
            value="api"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            API Explorer
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="overview"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <ClusterOverview clusterId={id} />
        </TabsContent>
        <TabsContent
          value="buckets"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <BucketList clusterId={id} />
        </TabsContent>
        <TabsContent
          value="keys"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <KeyList clusterId={id} />
        </TabsContent>
        <TabsContent
          value="nodes"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <ClusterNodeList clusterId={id} />
        </TabsContent>
        <TabsContent
          value="layout"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <LayoutManager clusterId={id} />
        </TabsContent>
        <TabsContent
          value="api"
          className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <ApiExplorer clusterId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
