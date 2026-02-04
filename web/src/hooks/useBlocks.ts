import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  BlockErrorsResponse,
  BlockInfoResponse,
  MultiNodeResponse,
  PurgeBlocksRequest,
} from '@/types/garage';

export function useBlockErrors(clusterId: string, nodeId: string = '*') {
  return useQuery<MultiNodeResponse<BlockErrorsResponse>>({
    queryKey: ['blockErrors', clusterId, nodeId],
    queryFn: async () => {
      const res = await api.get<MultiNodeResponse<BlockErrorsResponse>>(
        proxyPath(clusterId, `/v2/ListBlockErrors?node=${encodeURIComponent(nodeId)}`),
      );
      return res.data;
    },
  });
}

export function useBlockInfo(clusterId: string, blockHash: string, nodeId?: string) {
  return useQuery<MultiNodeResponse<BlockInfoResponse>>({
    queryKey: ['blockInfo', clusterId, blockHash, nodeId],
    queryFn: async () => {
      const params =
        nodeId && nodeId !== '*' ? `?node=${encodeURIComponent(nodeId)}` : '';
      const res = await api.post<MultiNodeResponse<BlockInfoResponse>>(
        proxyPath(clusterId, `/v2/GetBlockInfo${params}`),
        { blockHash },
      );
      return res.data;
    },
    enabled: !!blockHash,
  });
}

export function useRetryBlockResync(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { blockHash: string; nodeId?: string }) => {
      const params =
        data.nodeId && data.nodeId !== '*'
          ? `?node=${encodeURIComponent(data.nodeId)}`
          : '';
      await api.post(proxyPath(clusterId, `/v2/RetryBlockResync${params}`), {
        blockHashes: [data.blockHash],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockErrors', clusterId] });
    },
  });
}

export function usePurgeBlocks(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { blocks: PurgeBlocksRequest; nodeId?: string }) => {
      const params =
        data.nodeId && data.nodeId !== '*'
          ? `?node=${encodeURIComponent(data.nodeId)}`
          : '';
      await api.post(proxyPath(clusterId, `/v2/PurgeBlocks${params}`), data.blocks);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockErrors', clusterId] });
    },
  });
}
