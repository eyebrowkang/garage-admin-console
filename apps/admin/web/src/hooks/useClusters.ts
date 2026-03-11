import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ClusterSummary } from '@/types/garage';

export interface CreateClusterData {
  name: string;
  endpoint: string;
  adminToken: string;
  metricToken?: string;
}

export interface UpdateClusterData {
  name?: string;
  endpoint?: string;
  adminToken?: string;
  metricToken?: string;
}

export function useClusters() {
  return useQuery<ClusterSummary[]>({
    queryKey: ['clusters'],
    queryFn: async () => {
      const res = await api.get<ClusterSummary[]>('/clusters');
      return res.data;
    },
  });
}

export function useCluster(clusterId: string) {
  const { data: clusters } = useClusters();
  return clusters?.find((c) => c.id === clusterId);
}

export function useCreateCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateClusterData) => {
      const res = await api.post<ClusterSummary>('/clusters', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });
}

export function useUpdateCluster(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateClusterData) => {
      const res = await api.put<ClusterSummary>(`/clusters/${clusterId}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });
}

export function useDeleteCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clusterId: string) => {
      await api.delete(`/clusters/${clusterId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });
}
