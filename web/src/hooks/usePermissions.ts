import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type { AllowBucketKeyRequest, DenyBucketKeyRequest } from '@/types/garage';

export function useAllowBucketKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AllowBucketKeyRequest) => {
      await api.post(proxyPath(clusterId, '/v2/AllowBucketKey'), data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, vars.bucketId] });
      queryClient.invalidateQueries({ queryKey: ['key', clusterId, vars.accessKeyId] });
    },
  });
}

export function useDenyBucketKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DenyBucketKeyRequest) => {
      await api.post(proxyPath(clusterId, '/v2/DenyBucketKey'), data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, vars.bucketId] });
      queryClient.invalidateQueries({ queryKey: ['key', clusterId, vars.accessKeyId] });
    },
  });
}
