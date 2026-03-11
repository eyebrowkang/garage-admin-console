import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ConnectionLayout } from './ConnectionLayout';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
  },
}));

function renderConnectionLayout(initialPath = '/connections/conn-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/connections/:id" element={<ConnectionLayout />}>
            <Route index element={<div>Connection Child</div>} />
          </Route>
          <Route path="/" element={<div>Connections Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockApiGet.mockReset();
});

it('renders a loading state while the connection is being fetched', () => {
  mockApiGet.mockReturnValue(new Promise(() => {}));

  renderConnectionLayout();

  expect(screen.getByText(/Loading connection/i)).toBeInTheDocument();
  expect(screen.getByText(/Fetching connection details/i)).toBeInTheDocument();
});

it('renders a clean error state when the connection cannot be loaded', async () => {
  mockApiGet.mockRejectedValue(new Error('Connection not found'));

  renderConnectionLayout();

  expect(await screen.findByText(/Connection unavailable/i)).toBeInTheDocument();
  expect(screen.getByText(/Connection not found/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to Connections/i })).toBeInTheDocument();
});
