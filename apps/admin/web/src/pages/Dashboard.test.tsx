import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import { useClusters } from '@/hooks/useClusters';

vi.mock('@/hooks/useClusters', () => ({
  useClusters: vi.fn(),
}));

const mockedUseClusters = vi.mocked(useClusters);

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
      <Dashboard />
    </QueryClientProvider>,
  );
}

it('renders the dashboard loading state with consistent page structure', () => {
  mockedUseClusters.mockReturnValue({
    data: undefined,
    error: null,
    isLoading: true,
  } as unknown as ReturnType<typeof useClusters>);

  renderDashboard();

  expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument();
});

it('renders the admin dashboard empty state cleanly when no clusters exist', () => {
  mockedUseClusters.mockReturnValue({
    data: [],
    error: null,
    isLoading: false,
  } as unknown as ReturnType<typeof useClusters>);

  renderDashboard();

  expect(screen.getByRole('heading', { name: /No clusters configured yet/i })).toBeInTheDocument();
  expect(
    screen.getByText(/Connect a Garage cluster to see health, capacity, and operations here/i),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Connect your first cluster/i }),
  ).toBeInTheDocument();
});
