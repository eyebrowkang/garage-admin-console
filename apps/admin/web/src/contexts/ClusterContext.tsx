import { createContext, useContext } from 'react';
import type { ClusterSummary } from '@/types/garage';

interface ClusterContextValue {
  clusterId: string;
  cluster?: ClusterSummary;
}

export const ClusterContext = createContext<ClusterContextValue | null>(null);

export function useClusterContext() {
  const context = useContext(ClusterContext);
  if (!context) {
    throw new Error('useClusterContext must be used within ClusterLayout');
  }
  return context;
}
