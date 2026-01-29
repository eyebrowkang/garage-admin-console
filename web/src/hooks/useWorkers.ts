import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, proxyPath } from '@/lib/api';
import type {
  WorkersResponse,
  WorkerInfo,
  WorkerVariableResponse,
  MultiNodeResponse,
  SetWorkerVariableRequest,
} from '@/types/garage';

export function useWorkers(clusterId: string, nodeId: string = '*', busyOnly?: boolean) {
  return useQuery<MultiNodeResponse<WorkersResponse>>({
    queryKey: ['workers', clusterId, nodeId, busyOnly],
    queryFn: async () => {
      const res = await api.post<MultiNodeResponse<WorkersResponse>>(
        proxyPath(clusterId, `/v2/ListWorkers?node=${encodeURIComponent(nodeId)}`),
        { busyOnly },
      );
      return res.data;
    },
  });
}

export function useWorkerInfo(clusterId: string, nodeId: string = '*', workerId: number) {
  return useQuery<MultiNodeResponse<WorkerInfo>>({
    queryKey: ['workerInfo', clusterId, nodeId, workerId],
    queryFn: async () => {
      const res = await api.post<MultiNodeResponse<WorkerInfo>>(
        proxyPath(clusterId, `/v2/GetWorkerInfo?node=${encodeURIComponent(nodeId)}`),
        { id: workerId },
      );
      return res.data;
    },
    enabled: workerId !== undefined && workerId >= 0,
  });
}

export function useWorkerVariable(
  clusterId: string,
  nodeId: string = '*',
  variableName: string,
) {
  return useQuery<MultiNodeResponse<WorkerVariableResponse>>({
    queryKey: ['workerVariable', clusterId, nodeId, variableName],
    queryFn: async () => {
      const res = await api.post<MultiNodeResponse<WorkerVariableResponse>>(
        proxyPath(clusterId, `/v2/GetWorkerVariable?node=${encodeURIComponent(nodeId)}`),
        { variable: variableName },
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
      const nodeId = data.nodeId || '*';
      await api.post(
        proxyPath(clusterId, `/v2/SetWorkerVariable?node=${encodeURIComponent(nodeId)}`),
        {
          variable: data.variable,
          value: data.value,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workerVariable', clusterId],
      });
    },
  });
}
