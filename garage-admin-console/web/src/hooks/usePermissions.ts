import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type { AllowBucketKeyRequest, BucketInfo, DenyBucketKeyRequest } from '@/types/garage';

export function useAllowBucketKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AllowBucketKeyRequest) => {
      const res = await api.post<BucketInfo>(proxyPath(clusterId, '/v2/AllowBucketKey'), data);
      return res.data;
    },
    onSuccess: (bucketInfo, vars) => {
      queryClient.setQueryData(['bucket', clusterId, vars.bucketId], bucketInfo);
      queryClient.invalidateQueries({ queryKey: ['key', clusterId, vars.accessKeyId] });
    },
  });
}

export function useDenyBucketKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DenyBucketKeyRequest) => {
      const res = await api.post<BucketInfo>(proxyPath(clusterId, '/v2/DenyBucketKey'), data);
      return res.data;
    },
    onSuccess: (bucketInfo, vars) => {
      queryClient.setQueryData(['bucket', clusterId, vars.bucketId], bucketInfo);
      queryClient.invalidateQueries({ queryKey: ['key', clusterId, vars.accessKeyId] });
    },
  });
}
