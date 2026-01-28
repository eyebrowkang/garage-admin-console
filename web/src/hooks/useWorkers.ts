import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  WorkersResponse,
  WorkerInfo,
  WorkerVariableResponse,
  MultiNodeResponse,
  SetWorkerVariableRequest,
} from '@/types/garage';

export function useWorkers(clusterId: string, nodeId?: string) {
  return useQuery<MultiNodeResponse<WorkersResponse>>({
    queryKey: ['workers', clusterId, nodeId],
    queryFn: async () => {
      const params = nodeId ? `?node=${encodeURIComponent(nodeId)}` : '';
      const res = await api.get<MultiNodeResponse<WorkersResponse>>(
        proxyPath(clusterId, `/v2/ListWorkers${params}`),
      );
      return res.data;
    },
  });
}

export function useWorkerInfo(clusterId: string, nodeId: string, workerName: string) {
  return useQuery<MultiNodeResponse<WorkerInfo>>({
    queryKey: ['workerInfo', clusterId, nodeId, workerName],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('name', workerName);
      if (nodeId) params.set('node', nodeId);
      const res = await api.get<MultiNodeResponse<WorkerInfo>>(
        proxyPath(clusterId, `/v2/GetWorkerInfo?${params.toString()}`),
      );
      return res.data;
    },
    enabled: !!workerName,
  });
}

export function useWorkerVariable(
  clusterId: string,
  nodeId: string | undefined,
  variableName: string,
) {
  return useQuery<MultiNodeResponse<WorkerVariableResponse>>({
    queryKey: ['workerVariable', clusterId, nodeId, variableName],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('variable', variableName);
      if (nodeId) params.set('node', nodeId);
      const res = await api.get<MultiNodeResponse<WorkerVariableResponse>>(
        proxyPath(clusterId, `/v2/GetWorkerVariable?${params.toString()}`),
      );
      return res.data;
    },
    enabled: Boolean(variableName),
  });
}

export function useSetWorkerVariable(clusterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SetWorkerVariableRequest & { nodeId?: string }) => {
      const params = data.nodeId ? `?node=${encodeURIComponent(data.nodeId)}` : '';
      await api.post(proxyPath(clusterId, `/v2/SetWorkerVariable${params}`), {
        variable: data.variable,
        value: data.value,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ['workerVariable', clusterId, vars.variable],
      });
    },
  });
}
