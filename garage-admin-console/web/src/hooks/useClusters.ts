import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ClusterSummary } from '@/types/garage';

export function useClusters() {
  return useQuery<ClusterSummary[]>({
    queryKey: ['clusters'],
    queryFn: async () => {
      const res = await api.get<ClusterSummary[]>('/clusters');
      return res.data;
    },
  });
}
