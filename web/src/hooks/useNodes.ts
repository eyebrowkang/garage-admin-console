import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  GetClusterStatusResponse,
  MultiNodeResponse,
  NodeResp,
  NodeStatisticsResponse,
  ConnectClusterNodesRequest,
  LaunchRepairOperationRequest,
} from '@/types/garage';

export function useNodes(clusterId: string) {
  return useQuery<GetClusterStatusResponse>({
    queryKey: ['clusterStatus', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatusResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatus'),
      );
      return res.data;
    },
  });
}

export function useNodeInfo(clusterId: string, nodeId?: string) {
  return useQuery<MultiNodeResponse<NodeResp>>({
    queryKey: ['nodeInfo', clusterId, nodeId],
    queryFn: async () => {
      const params = nodeId ? `?node=${encodeURIComponent(nodeId)}` : '';
      const res = await api.get<MultiNodeResponse<NodeResp>>(
        proxyPath(clusterId, `/v2/GetNodeInfo${params}`),
      );
      return res.data;
    },
    enabled: Boolean(nodeId),
  });
}

export function useNodeStatistics(clusterId: string, nodeId?: string) {
  return useQuery<MultiNodeResponse<NodeStatisticsResponse>>({
    queryKey: ['nodeStats', clusterId, nodeId],
    queryFn: async () => {
      const params = nodeId ? `?node=${encodeURIComponent(nodeId)}` : '';
      const res = await api.get<MultiNodeResponse<NodeStatisticsResponse>>(
        proxyPath(clusterId, `/v2/GetNodeStatistics${params}`),
      );
      return res.data;
    },
    enabled: Boolean(nodeId),
  });
}

export function useConnectNodes(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConnectClusterNodesRequest) => {
      await api.post(proxyPath(clusterId, '/v2/ConnectClusterNodes'), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterHealth', clusterId] });
    },
  });
}

export function useCreateMetadataSnapshot(clusterId: string) {
  return useMutation({
    mutationFn: async (nodeId?: string) => {
      const params = nodeId ? `?node=${encodeURIComponent(nodeId)}` : '';
      await api.post(proxyPath(clusterId, `/v2/CreateMetadataSnapshot${params}`));
    },
  });
}

export function useLaunchRepairOperation(clusterId: string) {
  return useMutation({
    mutationFn: async (data: LaunchRepairOperationRequest & { nodeId?: string }) => {
      const params = data.nodeId ? `?node=${encodeURIComponent(data.nodeId)}` : '';
      await api.post(proxyPath(clusterId, `/v2/LaunchRepairOperation${params}`), {
        operation: data.operation,
      });
    },
  });
}
