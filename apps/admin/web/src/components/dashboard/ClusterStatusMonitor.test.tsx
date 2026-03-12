import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ClusterStatusMonitor } from './ClusterStatusMonitor';

function createClusterStatus(id: string) {
  return {
    cluster: {
      id,
      name: `Cluster ${id}`,
      endpoint: `http://${id}.example.com:3903`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    health: undefined,
    status: undefined,
    healthStatus: 'unknown' as const,
    isLoading: true,
  };
}

function renderMonitor(clusterIds: string[]) {
  return render(
    <MemoryRouter>
      <ClusterStatusMonitor
        clustersWithStatus={clusterIds.map(createClusterStatus)}
        onEditCluster={() => {}}
        onDeleteCluster={() => {}}
      />
    </MemoryRouter>,
  );
}

it('uses a single-column card grid when only one cluster is connected', () => {
  renderMonitor(['cluster-1']);

  const list = screen.getByRole('list', { name: /Cluster status cards/i });
  expect(list.className).toContain('grid-cols-1');
  expect(list.className).not.toContain('md:grid-cols-2');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
});

it('uses a compact fleet summary when only one cluster is connected', () => {
  renderMonitor(['cluster-1']);

  expect(screen.getByText(/1 connected cluster/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /Cluster Fleet Summary/i })).not.toBeInTheDocument();
  expect(screen.getByText(/Fleet status/i).className).toContain('text-muted-foreground');
});

it('uses a two-column card grid when multiple clusters are connected', () => {
  renderMonitor(['cluster-1', 'cluster-2']);

  const list = screen.getByRole('list', { name: /Cluster status cards/i });
  expect(list.className).toContain('md:grid-cols-2');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});
