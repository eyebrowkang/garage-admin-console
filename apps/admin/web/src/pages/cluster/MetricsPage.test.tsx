import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MetricsPage } from './MetricsPage';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  proxyPath: (clusterId: string, path: string) => `/proxy/${clusterId}${path}`,
}));

vi.mock('@/lib/errors', () => ({
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const mockedApiGet = vi.mocked(api.get);

function renderMetricsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clusters/test-cluster/metrics']}>
        <Routes>
          <Route path="/clusters/:id/metrics" element={<MetricsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedApiGet.mockReset();
});

it('renders a themed loading state while metrics are being fetched', () => {
  mockedApiGet.mockImplementation(() => new Promise(() => undefined));

  renderMetricsPage();

  expect(screen.getByRole('heading', { name: /Metrics/i })).toBeInTheDocument();
  expect(screen.getByText(/Loading cluster metrics/i)).toBeInTheDocument();
});

it('renders a descriptive alert when metrics loading fails', async () => {
  mockedApiGet.mockRejectedValue(new Error('Metrics endpoint unavailable'));

  renderMetricsPage();

  expect(screen.getByRole('heading', { name: /Metrics/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/Metrics endpoint unavailable/i)).toBeInTheDocument();
  });
});

it('renders metrics inside the admin module shell when loading succeeds', async () => {
  mockedApiGet.mockResolvedValue({
    data: '# HELP garage_ops_total\n# TYPE garage_ops_total counter',
  });

  renderMetricsPage();

  expect(screen.getByRole('heading', { name: /Metrics/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/# HELP garage_ops_total/i)).toBeInTheDocument();
  });
  expect(screen.getByText(/Raw Prometheus output/i)).toBeInTheDocument();
});
