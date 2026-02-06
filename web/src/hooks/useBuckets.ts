import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  ListBucketsResponseItem,
  BucketInfo,
  UpdateBucketRequest,
  CleanupIncompleteUploadsRequest,
  CleanupIncompleteUploadsResponse,
  InspectObjectResponse,
  BucketAliasInput,
  BucketAliasRequest,
  CreateBucketRequest,
} from '@/types/garage';

function bucketInfoToListItem(
  bucket: BucketInfo,
  existing?: ListBucketsResponseItem,
): ListBucketsResponseItem {
  const localAliases =
    bucket.keys?.flatMap((key) =>
      (key.bucketLocalAliases ?? []).map((alias) => ({
        accessKeyId: key.accessKeyId,
        alias,
      })),
    ) ??
    existing?.localAliases ??
    [];

  return {
    id: bucket.id,
    created: bucket.created ?? existing?.created ?? '',
    globalAliases: bucket.globalAliases ?? existing?.globalAliases ?? [],
    localAliases,
  };
}

function buildBucketAliasRequest(data: BucketAliasInput): BucketAliasRequest {
  if (data.accessKeyId) {
    return {
      bucketId: data.bucketId,
      localAlias: data.alias,
      accessKeyId: data.accessKeyId,
    };
  }

  return {
    bucketId: data.bucketId,
    globalAlias: data.alias,
  };
}

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
    mutationFn: async (data: CreateBucketRequest) => {
      await api.post(proxyPath(clusterId, '/v2/CreateBucket'), data);
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
      const res = await api.post<BucketInfo>(
        proxyPath(clusterId, `/v2/UpdateBucket?id=${encodeURIComponent(bucketId)}`),
        data,
      );
      return res.data;
    },
    onSuccess: (bucketInfo) => {
      queryClient.setQueryData(['bucket', clusterId, bucketId], bucketInfo);
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
    mutationFn: async (data: Omit<CleanupIncompleteUploadsRequest, 'bucketId'>) => {
      const res = await api.post<CleanupIncompleteUploadsResponse>(
        proxyPath(clusterId, '/v2/CleanupIncompleteUploads'),
        { ...data, bucketId },
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
      const res = await api.get<InspectObjectResponse>(
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
    mutationFn: async (data: BucketAliasInput) => {
      const res = await api.post<BucketInfo>(
        proxyPath(clusterId, '/v2/AddBucketAlias'),
        buildBucketAliasRequest(data),
      );
      return res.data;
    },
    onSuccess: (bucketInfo, vars) => {
      queryClient.setQueryData(['bucket', clusterId, vars.bucketId], bucketInfo);
      queryClient.setQueryData<ListBucketsResponseItem[]>(['buckets', clusterId], (prev) => {
        if (!prev) return prev;
        return prev.map((item) =>
          item.id === bucketInfo.id ? bucketInfoToListItem(bucketInfo, item) : item,
        );
      });
    },
  });
}

export function useRemoveBucketAlias(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BucketAliasInput) => {
      const res = await api.post<BucketInfo>(
        proxyPath(clusterId, '/v2/RemoveBucketAlias'),
        buildBucketAliasRequest(data),
      );
      return res.data;
    },
    onSuccess: (bucketInfo, vars) => {
      queryClient.setQueryData(['bucket', clusterId, vars.bucketId], bucketInfo);
      queryClient.setQueryData<ListBucketsResponseItem[]>(['buckets', clusterId], (prev) => {
        if (!prev) return prev;
        return prev.map((item) =>
          item.id === bucketInfo.id ? bucketInfoToListItem(bucketInfo, item) : item,
        );
      });
    },
  });
}
