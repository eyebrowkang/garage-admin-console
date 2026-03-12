import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ClusterLayout } from './ClusterLayout';
import { useBlockErrors } from '@/hooks/useBlocks';
import { useClusters } from '@/hooks/useClusters';

vi.mock('@/hooks/useClusters', () => ({
  useClusters: vi.fn(),
}));

vi.mock('@/hooks/useBlocks', () => ({
  useBlockErrors: vi.fn(),
}));

const mockedUseClusters = vi.mocked(useClusters);
const mockedUseBlockErrors = vi.mocked(useBlockErrors);

function renderClusterLayout() {
  return render(
    <MemoryRouter initialEntries={['/clusters/cluster-1']}>
      <Routes>
        <Route path="/clusters/:id" element={<ClusterLayout />}>
          <Route index element={<div>Overview content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

it('renders loading placeholders for cluster identity instead of a fake loading title', () => {
  mockedUseClusters.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useClusters>);
  mockedUseBlockErrors.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useBlockErrors>);

  renderClusterLayout();

  expect(screen.queryByRole('heading', { name: /^Loading\.\.\.$/i })).not.toBeInTheDocument();
  expect(screen.getAllByText(/Loading cluster information/i)).toHaveLength(2);
});

it('renders the cluster identity when cluster data is available', () => {
  mockedUseClusters.mockReturnValue({
    data: [
      {
        id: 'cluster-1',
        name: 'Production Cluster',
        endpoint: 'http://10.0.0.1:3903',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  } as unknown as ReturnType<typeof useClusters>);
  mockedUseBlockErrors.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useBlockErrors>);

  renderClusterLayout();

  expect(screen.getAllByText('Production Cluster')).not.toHaveLength(0);
  expect(screen.getAllByText('http://10.0.0.1:3903')).not.toHaveLength(0);
});

it('renders mobile cluster navigation as a grid of module links', () => {
  mockedUseClusters.mockReturnValue({
    data: [
      {
        id: 'cluster-1',
        name: 'Production Cluster',
        endpoint: 'http://10.0.0.1:3903',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  } as unknown as ReturnType<typeof useClusters>);
  mockedUseBlockErrors.mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useBlockErrors>);

  renderClusterLayout();

  const nav = screen.getByRole('navigation', { name: /Cluster modules/i });
  expect(nav.className).toContain('grid');
  expect(nav.className).toContain('grid-cols-4');
});
