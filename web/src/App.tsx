import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './layouts/MainLayout';
import { ClusterLayout } from './layouts/ClusterLayout';
import { Toaster } from '@/components/ui/toaster';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy-load cluster sub-pages (only needed when navigating into a cluster)
const ClusterOverview = React.lazy(() =>
  import('./pages/cluster/ClusterOverview').then((m) => ({ default: m.ClusterOverview })),
);
const BucketList = React.lazy(() =>
  import('./pages/cluster/BucketList').then((m) => ({ default: m.BucketList })),
);
const BucketDetail = React.lazy(() =>
  import('./pages/cluster/BucketDetail').then((m) => ({ default: m.BucketDetail })),
);
const KeyList = React.lazy(() =>
  import('./pages/cluster/KeyList').then((m) => ({ default: m.KeyList })),
);
const KeyDetail = React.lazy(() =>
  import('./pages/cluster/KeyDetail').then((m) => ({ default: m.KeyDetail })),
);
const ClusterNodeList = React.lazy(() =>
  import('./pages/cluster/NodeList').then((m) => ({ default: m.ClusterNodeList })),
);
const NodeDetail = React.lazy(() =>
  import('./pages/cluster/NodeDetail').then((m) => ({ default: m.NodeDetail })),
);
const LayoutManager = React.lazy(() =>
  import('./pages/cluster/LayoutManager').then((m) => ({ default: m.LayoutManager })),
);
const AdminTokenList = React.lazy(() =>
  import('./pages/cluster/AdminTokenList').then((m) => ({ default: m.AdminTokenList })),
);
const AdminTokenDetail = React.lazy(() =>
  import('./pages/cluster/AdminTokenDetail').then((m) => ({ default: m.AdminTokenDetail })),
);
const BlockManager = React.lazy(() =>
  import('./pages/cluster/BlockManager').then((m) => ({ default: m.BlockManager })),
);
const WorkerManager = React.lazy(() =>
  import('./pages/cluster/WorkerManager').then((m) => ({ default: m.WorkerManager })),
);
const MetricsPage = React.lazy(() =>
  import('./pages/cluster/MetricsPage').then((m) => ({ default: m.MetricsPage })),
);

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

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function LazyFallback() {
  return <PageLoadingState label="Loading..." />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/clusters/:id/metrics"
            element={
              <ProtectedRoute>
                <Suspense fallback={<LazyFallback />}>
                  <MetricsPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
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
              <Route index element={<ClusterOverview />} />
              <Route path="buckets" element={<BucketList />} />
              <Route path="buckets/:bid" element={<BucketDetail />} />
              <Route path="keys" element={<KeyList />} />
              <Route path="keys/:kid" element={<KeyDetail />} />
              <Route path="nodes" element={<ClusterNodeList />} />
              <Route path="nodes/:nid" element={<NodeDetail />} />
              <Route path="layout" element={<LayoutManager />} />
              <Route path="tokens" element={<AdminTokenList />} />
              <Route path="tokens/:tid" element={<AdminTokenDetail />} />
              <Route path="blocks" element={<BlockManager />} />
              <Route path="workers" element={<WorkerManager />} />
            </Route>
          </Route>
        </Routes>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
