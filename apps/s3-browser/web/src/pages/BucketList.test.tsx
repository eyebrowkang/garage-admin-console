import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { BucketList } from './BucketList';
import { ConnectionContext, type Connection } from '@/hooks/use-connection-context';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
  },
}));

function CurrentLocation() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderBucketList(
  connectionOverrides: Partial<Connection> = {},
  initialPath = '/connections/conn-1',
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const connection: Connection = {
    id: 'conn-1',
    name: 'Primary Connection',
    endpoint: 'https://s3.example.test',
    region: null,
    bucket: null,
    pathStyle: false,
    ...connectionOverrides,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionContext.Provider value={{ connectionId: connection.id, connection }}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/connections/:id" element={<BucketList />} />
            <Route path="/connections/:id/browse" element={<CurrentLocation />} />
          </Routes>
        </MemoryRouter>
      </ConnectionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockApiGet.mockReset();
});

it('redirects directly to object browsing when the connection is pinned to a fixed bucket', async () => {
  renderBucketList({ bucket: 'archive' });

  expect(await screen.findByTestId('location')).toHaveTextContent(
    '/connections/conn-1/browse?bucket=archive',
  );
});

it('renders a clean empty state when no accessible buckets are returned', async () => {
  mockApiGet.mockResolvedValue({
    data: {
      buckets: [],
    },
  });

  renderBucketList();

  expect(await screen.findByRole('heading', { name: /No buckets available/i })).toBeInTheDocument();
  expect(
    screen.getByText(/This connection is working, but the current credentials cannot see any buckets/i),
  ).toBeInTheDocument();
});
