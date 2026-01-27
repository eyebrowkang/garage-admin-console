import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BucketList } from './cluster/BucketList';
import { KeyList } from './cluster/KeyList';
import { ClusterNodeList } from './cluster/NodeList';
import { ClusterOverview } from './cluster/ClusterOverview';

export default function ClusterDetail() {
    const { id } = useParams();

    if (!id) return <div>Invalid Cluster ID</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Cluster Management</h2>
                <div className="text-sm text-muted-foreground">
                    ID: {id}
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="buckets">Buckets</TabsTrigger>
                    <TabsTrigger value="keys">Keys</TabsTrigger>
                    <TabsTrigger value="nodes">Nodes</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4">
                    <ClusterOverview clusterId={id} />
                </TabsContent>
                <TabsContent value="buckets">
                    <BucketList clusterId={id} />
                </TabsContent>
                <TabsContent value="keys">
                    <KeyList clusterId={id} />
                </TabsContent>
                <TabsContent value="nodes">
                    <ClusterNodeList clusterId={id} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
