import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  ListBucketsResponseItem,
  BucketInfo,
  UpdateBucketRequest,
  CleanupIncompleteUploadsRequest,
  CleanupIncompleteUploadsResponse,
  InspectObjectResponse,
} from '@/types/garage';

export function useBuckets(clusterId: string) {
  return useQuery<ListBucketsResponseItem[]>({
    queryKey: ['buckets', clusterId],
    queryFn: async () => {
      const res = await api.get<ListBucketsResponseItem[]>(proxyPath(clusterId, '/v2/ListBuckets'));
      return res.data;
    },
  });
}

export function useBucketInfo(clusterId: string, bucketId: string) {
  return useQuery<BucketInfo>({
    queryKey: ['bucket', clusterId, bucketId],
    queryFn: async () => {
      const res = await api.get<BucketInfo>(
        proxyPath(clusterId, `/v2/GetBucketInfo?id=${encodeURIComponent(bucketId)}`),
      );
      return res.data;
    },
    enabled: Boolean(bucketId),
  });
}

export function useCreateBucket(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (globalAlias: string) => {
      await api.post(proxyPath(clusterId, '/v2/CreateBucket'), { globalAlias });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    },
  });
}

export function useUpdateBucket(clusterId: string, bucketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateBucketRequest) => {
      await api.post(
        proxyPath(clusterId, `/v2/UpdateBucket?id=${encodeURIComponent(bucketId)}`),
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, bucketId] });
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    },
  });
}

export function useDeleteBucket(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bucketId: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteBucket?id=${encodeURIComponent(bucketId)}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    },
  });
}

export function useCleanupIncompleteUploads(clusterId: string, bucketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CleanupIncompleteUploadsRequest) => {
      const res = await api.post<CleanupIncompleteUploadsResponse>(
        proxyPath(
          clusterId,
          `/v2/CleanupIncompleteUploads?bucketId=${encodeURIComponent(bucketId)}`,
        ),
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, bucketId] });
    },
  });
}

export function useInspectObject(clusterId: string, bucketId: string) {
  return useMutation({
    mutationFn: async (objectKey: string) => {
      const res = await api.post<InspectObjectResponse>(
        proxyPath(
          clusterId,
          `/v2/InspectObject?bucketId=${encodeURIComponent(bucketId)}&key=${encodeURIComponent(objectKey)}`,
        ),
      );
      return res.data;
    },
  });
}

export function useAddBucketAlias(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { bucketId: string; alias: string; accessKeyId?: string }) => {
      const params = new URLSearchParams();
      params.set('id', data.bucketId);
      params.set('alias', data.alias);
      if (data.accessKeyId) params.set('accessKeyId', data.accessKeyId);
      await api.post(proxyPath(clusterId, `/v2/AddBucketAlias?${params.toString()}`));
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, vars.bucketId] });
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    },
  });
}

export function useRemoveBucketAlias(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { bucketId: string; alias: string; accessKeyId?: string }) => {
      const params = new URLSearchParams();
      params.set('id', data.bucketId);
      params.set('alias', data.alias);
      if (data.accessKeyId) params.set('accessKeyId', data.accessKeyId);
      await api.post(proxyPath(clusterId, `/v2/RemoveBucketAlias?${params.toString()}`));
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bucket', clusterId, vars.bucketId] });
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    },
  });
}
