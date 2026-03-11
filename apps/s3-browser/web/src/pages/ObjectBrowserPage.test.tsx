import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ObjectBrowserPage } from './ObjectBrowserPage';
import { ConnectionContext, type Connection } from '@/hooks/use-connection-context';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/components/UploadDialog', () => ({
  UploadDialog: () => null,
}));

vi.mock('@/components/CreateFolderDialog', () => ({
  CreateFolderDialog: () => null,
}));

vi.mock('@/components/DeleteObjectDialog', () => ({
  DeleteObjectDialog: () => null,
}));

function renderObjectBrowserPage(initialPath: string) {
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
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionContext.Provider value={{ connectionId: connection.id, connection }}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/connections/:id/browse" element={<ObjectBrowserPage />} />
            <Route path="/connections/:id" element={<div>Back to buckets</div>} />
          </Routes>
        </MemoryRouter>
      </ConnectionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mockApiGet.mockReset();
});

it('renders a clean prompt when no bucket is selected', () => {
  renderObjectBrowserPage('/connections/conn-1/browse');

  expect(screen.getByText(/No bucket selected/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Back to buckets/i })).toBeInTheDocument();
});

it('renders an object-list error state cleanly', async () => {
  mockApiGet.mockRejectedValue(new Error('Failed to reach the storage endpoint'));

  renderObjectBrowserPage('/connections/conn-1/browse?bucket=photos');

  expect(await screen.findByText(/Unable to load objects/i)).toBeInTheDocument();
  expect(screen.getByText(/Failed to reach the storage endpoint/i)).toBeInTheDocument();
});

it('renders a clean empty-bucket state for standalone browsing', async () => {
  mockApiGet.mockResolvedValue({
    data: {
      bucket: 'photos',
      prefix: '',
      commonPrefixes: [],
      objects: [],
      isTruncated: false,
    },
  });

  renderObjectBrowserPage('/connections/conn-1/browse?bucket=photos');

  expect(await screen.findByRole('heading', { name: /This bucket is empty/i })).toBeInTheDocument();
  expect(
    screen.getByText(/Upload your first file or create a folder to start organizing this bucket/i),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /New Folder/i })).toBeInTheDocument();
});
