import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Server } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatRelativeSeconds, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type { GetClusterStatusResponse, NodeResp } from '@/types/garage';

interface NodeListProps {
  clusterId: string;
}

export function ClusterNodeList({ clusterId }: NodeListProps) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery<GetClusterStatusResponse>({
    queryKey: ['clusterStatus', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatusResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatus'),
      );
      return res.data;
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load nodes</AlertTitle>
        <AlertDescription>
          {getApiErrorMessage(error, 'Node status could not be loaded.')}
        </AlertDescription>
      </Alert>
    );
  }

  const nodes = data?.nodes ?? [];

  const getStatusBadge = (node: NodeResp) => {
    if (node.draining) {
      return <Badge variant="warning">Draining</Badge>;
    }
    return node.isUp ? (
      <Badge variant="success">Up</Badge>
    ) : (
      <Badge variant="destructive">Down</Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4" />
        Layout version:{' '}
        <span className="font-medium text-slate-900">{data?.layoutVersion ?? '-'}</span>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node</TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Data Disk</TableHead>
              <TableHead>Metadata Disk</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => (
              <TableRow
                key={node.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/clusters/${clusterId}/nodes/${node.id}`)}
              >
                <TableCell className="font-mono text-xs">{formatShortId(node.id, 10)}</TableCell>
                <TableCell>{node.hostname || '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{node.addr || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {getStatusBadge(node)}
                    {!node.isUp &&
                      node.lastSeenSecsAgo !== null &&
                      node.lastSeenSecsAgo !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          Last seen {formatRelativeSeconds(node.lastSeenSecsAgo)}
                        </span>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  {node.role ? (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        Zone: <span className="text-slate-900">{node.role.zone}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Capacity:{' '}
                        <span className="text-slate-900">
                          {formatBytes(node.role.capacity ?? null)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {node.role.tags.length > 0 ? (
                          node.role.tags.map((tag) => (
                            <Badge key={`${node.id}-${tag}`} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No tags</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.dataPartition
                    ? `${formatBytes(node.dataPartition.available)} / ${formatBytes(node.dataPartition.total)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.metadataPartition
                    ? `${formatBytes(node.metadataPartition.available)} / ${formatBytes(node.metadataPartition.total)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.garageVersion || '-'}
                </TableCell>
              </TableRow>
            ))}
            {nodes.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                  No nodes information available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
