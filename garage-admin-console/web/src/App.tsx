import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { readStoredToken } from '@/lib/api';
import { MainLayout } from './layouts/MainLayout';
import { ClusterLayout } from './layouts/ClusterLayout';
import { Toaster } from '@garage/ui';
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
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = readStoredToken();
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

function App() {
  return (
    <>
      <Router>
        <ScrollToTop />
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
    </>
  );
}

export default App;
