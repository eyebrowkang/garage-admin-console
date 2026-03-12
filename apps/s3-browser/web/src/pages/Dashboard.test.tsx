import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { Dashboard } from './Dashboard';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockApiGet.mockReset();
});

it('renders bridge-managed connections with a hardened title and explicit actions', async () => {
  const bridgeName =
    'admin-bridge:beb2aae2-73d5-43fe-a24e-bc980b9f2080:d618e70a972f50b49fc81b2442d186f505e3b18ddf7ae13a5df26dc8986d445b:GK889049d7cc75a40f76d77c15';

  mockApiGet.mockResolvedValue({
    data: [
      {
        id: 'conn-1',
        name: bridgeName,
        endpoint: 'http://192.168.88.60:3900',
        region: 'garage',
        bucket: 'hello',
        pathStyle: true,
        createdAt: '2026-03-12T00:00:00.000Z',
        updatedAt: '2026-03-12T00:00:00.000Z',
      },
    ],
  });

  renderDashboard();

  expect(await screen.findByRole('list', { name: /Connection cards/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Admin bridge connection/i })).toBeInTheDocument();
  expect(screen.getByText(/Internal ID/i)).toBeInTheDocument();
  expect(screen.getByText(bridgeName)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Browse Admin bridge connection/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Edit Admin bridge connection/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Delete Admin bridge connection/i }),
  ).toBeInTheDocument();
});

it('resets the add-connection form when it is reopened from the dashboard', async () => {
  const user = userEvent.setup();

  mockApiGet.mockResolvedValue({
    data: [],
  });

  renderDashboard();

  expect(await screen.findByRole('heading', { name: /No connections configured yet/i })).toBeInTheDocument();

  await user.click(screen.getAllByRole('button', { name: /Add Connection/i })[0]);
  await user.type(screen.getByLabelText(/Connection Name/i), 'Temporary connection');
  await user.type(screen.getByLabelText(/Endpoint URL/i), 'https://staging.example.com');
  await user.click(screen.getByRole('button', { name: /Cancel/i }));

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  await user.click(screen.getAllByRole('button', { name: /Add Connection/i })[0]);

  expect(screen.getByLabelText(/Connection Name/i)).toHaveValue('');
  expect(screen.getByLabelText(/Endpoint URL/i)).toHaveValue('');
});
