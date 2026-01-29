import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './layouts/MainLayout';
import { ClusterLayout } from './layouts/ClusterLayout';
import { useClusterContext } from '@/contexts/ClusterContext';
import { Toaster } from '@/components/ui/toaster';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { ClusterOverview } from './pages/cluster/ClusterOverview';
import { BucketList } from './pages/cluster/BucketList';
import { BucketDetail } from './pages/cluster/BucketDetail';
import { KeyList } from './pages/cluster/KeyList';
import { KeyDetail } from './pages/cluster/KeyDetail';
import { ClusterNodeList } from './pages/cluster/NodeList';
import { NodeDetail } from './pages/cluster/NodeDetail';
import { LayoutManager } from './pages/cluster/LayoutManager';
import { ApiExplorer } from './pages/cluster/ApiExplorer';
import { AdminTokenList } from './pages/cluster/AdminTokenList';
import { AdminTokenDetail } from './pages/cluster/AdminTokenDetail';
import { BlockManager } from './pages/cluster/BlockManager';
import { WorkerManager } from './pages/cluster/WorkerManager';
import { MetricsPage } from './pages/cluster/MetricsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error && typeof error === 'object' && 'response' in error) {
          const status = (error as { response?: { status?: number } }).response?.status;
          if (status === 401 || status === 403) return false;
        }
        return failureCount < 3;
      },
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Wrapper components to pass clusterId from context
function ClusterOverviewWrapper() {
  const { clusterId } = useClusterContext();
  return <ClusterOverview clusterId={clusterId} />;
}

function BucketListWrapper() {
  const { clusterId } = useClusterContext();
  return <BucketList clusterId={clusterId} />;
}

function KeyListWrapper() {
  const { clusterId } = useClusterContext();
  return <KeyList clusterId={clusterId} />;
}

function NodeListWrapper() {
  const { clusterId } = useClusterContext();
  return <ClusterNodeList clusterId={clusterId} />;
}

function LayoutManagerWrapper() {
  const { clusterId } = useClusterContext();
  return <LayoutManager clusterId={clusterId} />;
}

function ApiExplorerWrapper() {
  const { clusterId } = useClusterContext();
  return <ApiExplorer clusterId={clusterId} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="clusters" element={<Dashboard />} />
            <Route path="clusters/:id" element={<ClusterLayout />}>
              <Route index element={<ClusterOverviewWrapper />} />
              <Route path="buckets" element={<BucketListWrapper />} />
              <Route path="buckets/:bid" element={<BucketDetail />} />
              <Route path="keys" element={<KeyListWrapper />} />
              <Route path="keys/:kid" element={<KeyDetail />} />
              <Route path="nodes" element={<NodeListWrapper />} />
              <Route path="nodes/:nid" element={<NodeDetail />} />
              <Route path="layout" element={<LayoutManagerWrapper />} />
              <Route path="tokens" element={<AdminTokenList />} />
              <Route path="tokens/:tid" element={<AdminTokenDetail />} />
              <Route path="blocks" element={<BlockManager />} />
              <Route path="workers" element={<WorkerManager />} />
              <Route path="metrics" element={<MetricsPage />} />
              <Route path="api" element={<ApiExplorerWrapper />} />
            </Route>
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
