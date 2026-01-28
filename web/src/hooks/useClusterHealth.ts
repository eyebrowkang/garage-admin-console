import { useQuery } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  GetClusterHealthResponse,
  GetClusterStatusResponse,
  GetClusterStatisticsResponse,
} from '@/types/garage';

export function useClusterHealth(clusterId: string) {
  return useQuery<GetClusterHealthResponse>({
    queryKey: ['clusterHealth', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterHealthResponse>(
        proxyPath(clusterId, '/v2/GetClusterHealth'),
      );
      return res.data;
    },
    staleTime: 30000,
  });
}

export function useClusterStatus(clusterId: string) {
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

export function useClusterStatistics(clusterId: string) {
  return useQuery<GetClusterStatisticsResponse>({
    queryKey: ['clusterStats', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatisticsResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatistics'),
      );
      return res.data;
    },
  });
}
