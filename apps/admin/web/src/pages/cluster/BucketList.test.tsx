import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { BucketList } from './BucketList';
import { ClusterContext } from '@/contexts/ClusterContext';
import { useBuckets } from '@/hooks/useBuckets';
import { useKeys } from '@/hooks/useKeys';

vi.mock('@/hooks/useBuckets', () => ({
  useBuckets: vi.fn(),
}));

vi.mock('@/hooks/useKeys', () => ({
  useKeys: vi.fn(),
}));

const mockedUseBuckets = vi.mocked(useBuckets);
const mockedUseKeys = vi.mocked(useKeys);

function renderBucketList() {
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
          <BucketList />
        </ClusterContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('renders a dedicated mobile bucket card list for narrow layouts', () => {
  mockedUseBuckets.mockReturnValue({
    data: [
      {
        id: 'bucket-1',
        created: '2026-03-12T00:00:00.000Z',
        globalAliases: ['images'],
        localAliases: [{ accessKeyId: 'key-1', alias: 'images-local' }],
      },
    ],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useBuckets>);
  mockedUseKeys.mockReturnValue({
    data: [{ id: 'key-1', name: 'Image key', expired: false }],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useKeys>);

  renderBucketList();

  const list = screen.getByRole('list', { name: /Bucket cards/i });
  expect(list.className).toContain('md:hidden');
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
});
