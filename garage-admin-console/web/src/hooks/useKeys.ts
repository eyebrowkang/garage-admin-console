import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  ListKeysResponseItem,
  GetKeyInfoResponse,
  ImportKeyRequest,
  CreateKeyRequest,
  UpdateKeyRequest,
} from '@/types/garage';

export function useKeys(clusterId: string) {
  return useQuery<ListKeysResponseItem[]>({
    queryKey: ['keys', clusterId],
    queryFn: async () => {
      const res = await api.get<ListKeysResponseItem[]>(proxyPath(clusterId, '/v2/ListKeys'));
      return res.data;
    },
  });
}

export function useKeyInfo(clusterId: string, keyId: string) {
  return useQuery<GetKeyInfoResponse>({
    queryKey: ['key', clusterId, keyId],
    queryFn: async () => {
      const res = await api.get<GetKeyInfoResponse>(
        proxyPath(clusterId, `/v2/GetKeyInfo?id=${encodeURIComponent(keyId)}`),
      );
      return res.data;
    },
    enabled: Boolean(keyId),
  });
}

export function useCreateKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateKeyRequest) => {
      const res = await api.post<GetKeyInfoResponse>(proxyPath(clusterId, '/v2/CreateKey'), data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
    },
  });
}

export function useUpdateKey(clusterId: string, keyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateKeyRequest) => {
      const res = await api.post<GetKeyInfoResponse>(
        proxyPath(clusterId, `/v2/UpdateKey?id=${encodeURIComponent(keyId)}`),
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['key', clusterId, keyId] });
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
    },
  });
}

export function useDeleteKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteKey?id=${encodeURIComponent(keyId)}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
    },
  });
}

export function useImportKey(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ImportKeyRequest) => {
      const res = await api.post<GetKeyInfoResponse>(proxyPath(clusterId, '/v2/ImportKey'), data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
    },
  });
}
