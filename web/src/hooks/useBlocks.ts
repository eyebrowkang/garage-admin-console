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

export function useBlockInfo(clusterId: string, blockHash: string) {
  return useQuery<MultiNodeResponse<BlockInfoResponse>>({
    queryKey: ['blockInfo', clusterId, blockHash],
    queryFn: async () => {
      const res = await api.get<MultiNodeResponse<BlockInfoResponse>>(
        proxyPath(clusterId, `/v2/GetBlockInfo?hash=${encodeURIComponent(blockHash)}`),
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
      const params = new URLSearchParams();
      params.set('hash', data.blockHash);
      if (data.nodeId) params.set('node', data.nodeId);
      await api.post(proxyPath(clusterId, `/v2/RetryBlockResync?${params.toString()}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockErrors', clusterId] });
    },
  });
}

export function usePurgeBlocks(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PurgeBlocksRequest) => {
      await api.post(proxyPath(clusterId, '/v2/PurgeBlocks'), data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockErrors', clusterId] });
    },
  });
}
