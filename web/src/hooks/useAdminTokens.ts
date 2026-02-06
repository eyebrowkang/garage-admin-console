import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  AdminTokenInfo,
  CreateAdminTokenRequest,
  CreateAdminTokenResponse,
  UpdateAdminTokenRequest,
} from '@/types/garage';

export function useAdminTokens(clusterId: string) {
  return useQuery<AdminTokenInfo[]>({
    queryKey: ['adminTokens', clusterId],
    queryFn: async () => {
      const res = await api.get<AdminTokenInfo[]>(proxyPath(clusterId, '/v2/ListAdminTokens'));
      return res.data;
    },
  });
}

export function useAdminTokenInfo(clusterId: string, tokenId: string) {
  return useQuery<AdminTokenInfo>({
    queryKey: ['adminToken', clusterId, tokenId],
    queryFn: async () => {
      const res = await api.get<AdminTokenInfo>(
        proxyPath(clusterId, `/v2/GetAdminTokenInfo?id=${encodeURIComponent(tokenId)}`),
      );
      return res.data;
    },
    enabled: Boolean(tokenId),
  });
}

export function useCurrentAdminToken(clusterId: string) {
  return useQuery<AdminTokenInfo>({
    queryKey: ['currentAdminToken', clusterId],
    queryFn: async () => {
      const res = await api.get<AdminTokenInfo>(
        proxyPath(clusterId, '/v2/GetCurrentAdminTokenInfo'),
      );
      return res.data;
    },
  });
}

export function useCreateAdminToken(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAdminTokenRequest) => {
      const res = await api.post<CreateAdminTokenResponse>(
        proxyPath(clusterId, '/v2/CreateAdminToken'),
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTokens', clusterId] });
    },
  });
}

export function useUpdateAdminToken(clusterId: string, tokenId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateAdminTokenRequest) => {
      await api.post(
        proxyPath(clusterId, `/v2/UpdateAdminToken?id=${encodeURIComponent(tokenId)}`),
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminToken', clusterId, tokenId] });
      queryClient.invalidateQueries({ queryKey: ['adminTokens', clusterId] });
    },
  });
}

export function useDeleteAdminToken(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tokenId: string) => {
      await api.post(
        proxyPath(clusterId, `/v2/DeleteAdminToken?id=${encodeURIComponent(tokenId)}`),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTokens', clusterId] });
    },
  });
}

export function useAdminTokenLookup(clusterId: string) {
  return useMutation({
    mutationFn: async ({ id, search }: { id?: string; search?: string }) => {
      const params = new URLSearchParams();
      if (id) params.set('id', id);
      if (search) params.set('search', search);
      const query = params.toString();
      const res = await api.get<AdminTokenInfo>(
        proxyPath(clusterId, `/v2/GetAdminTokenInfo${query ? `?${query}` : ''}`),
      );
      return res.data;
    },
  });
}
