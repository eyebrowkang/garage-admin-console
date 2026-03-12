import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { KeyList } from './KeyList';
import { ClusterContext } from '@/contexts/ClusterContext';
import { useImportKey, useKeys } from '@/hooks/useKeys';

vi.mock('@/hooks/useKeys', () => ({
  useKeys: vi.fn(),
  useImportKey: vi.fn(),
}));

const mockedUseKeys = vi.mocked(useKeys);
const mockedUseImportKey = vi.mocked(useImportKey);

function renderKeyList() {
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
        <ClusterContext.Provider value={{ clusterId: 'cluster-1' }}>
          <KeyList />
        </ClusterContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('renders a dedicated mobile key card list for narrow layouts', () => {
  mockedUseKeys.mockReturnValue({
    data: [
      {
        id: 'AKIAEXAMPLE123',
        name: 'Gallery key',
        expired: false,
        created: '2026-03-12T00:00:00.000Z',
        expiration: null,
      },
    ],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useKeys>);
  mockedUseImportKey.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useImportKey>);

  renderKeyList();

  const list = screen.getByRole('list', { name: /Access key cards/i });
  expect(list.className).toContain('md:hidden');
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
});
