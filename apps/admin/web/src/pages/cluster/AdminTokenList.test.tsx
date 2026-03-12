import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AdminTokenList } from './AdminTokenList';
import { ClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokens,
  useCreateAdminToken,
  useCurrentAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';

vi.mock('@/hooks/useAdminTokens', () => ({
  useAdminTokens: vi.fn(),
  useCurrentAdminToken: vi.fn(),
  useCreateAdminToken: vi.fn(),
  useDeleteAdminToken: vi.fn(),
}));

const mockedUseAdminTokens = vi.mocked(useAdminTokens);
const mockedUseCurrentAdminToken = vi.mocked(useCurrentAdminToken);
const mockedUseCreateAdminToken = vi.mocked(useCreateAdminToken);
const mockedUseDeleteAdminToken = vi.mocked(useDeleteAdminToken);

function renderAdminTokenList() {
  return render(
    <MemoryRouter>
      <ClusterContext.Provider value={{ clusterId: 'cluster-1' }}>
        <AdminTokenList />
      </ClusterContext.Provider>
    </MemoryRouter>,
  );
}

it('renders a dedicated mobile admin token card list for narrow layouts', () => {
  mockedUseAdminTokens.mockReturnValue({
    data: [
      {
        id: 'token-1',
        name: 'Primary token',
        expired: false,
        scope: ['*'],
        created: '2026-03-12T00:00:00.000Z',
        expiration: null,
      },
    ],
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useAdminTokens>);
  mockedUseCurrentAdminToken.mockReturnValue({
    data: null,
  } as unknown as ReturnType<typeof useCurrentAdminToken>);
  mockedUseCreateAdminToken.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateAdminToken>);
  mockedUseDeleteAdminToken.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteAdminToken>);

  renderAdminTokenList();

  const list = screen.getByRole('list', { name: /Admin token cards/i });
  expect(list.className).toContain('md:hidden');
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
});
