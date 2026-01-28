import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  GetClusterLayoutResponse,
  LayoutHistory,
  LayoutPreviewResponse,
  NodeRoleChange,
  LayoutParameters,
  SkipDeadNodesRequest,
} from '@/types/garage';

export function useClusterLayout(clusterId: string) {
  return useQuery<GetClusterLayoutResponse>({
    queryKey: ['clusterLayout', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterLayoutResponse>(
        proxyPath(clusterId, '/v2/GetClusterLayout'),
      );
      return res.data;
    },
  });
}

export function useLayoutHistory(clusterId: string) {
  return useQuery<LayoutHistory>({
    queryKey: ['layoutHistory', clusterId],
    queryFn: async () => {
      const res = await api.get<LayoutHistory>(proxyPath(clusterId, '/v2/GetClusterLayoutHistory'));
      return res.data;
    },
  });
}

export function useUpdateLayout(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { roles?: NodeRoleChange[]; parameters?: LayoutParameters }) => {
      await api.post(proxyPath(clusterId, '/v2/UpdateClusterLayout'), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
    },
  });
}

export function usePreviewLayout(clusterId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<LayoutPreviewResponse>(
        proxyPath(clusterId, '/v2/PreviewClusterLayoutChanges'),
      );
      return res.data;
    },
  });
}

export function useApplyLayout(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (version: number) => {
      await api.post(proxyPath(clusterId, '/v2/ApplyClusterLayout'), { version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['layoutHistory', clusterId] });
    },
  });
}

export function useRevertLayout(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post(proxyPath(clusterId, '/v2/RevertClusterLayout'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
    },
  });
}

export function useSkipDeadNodes(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SkipDeadNodesRequest) => {
      await api.post(proxyPath(clusterId, '/v2/ClusterLayoutSkipDeadNodes'), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
    },
  });
}
