import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S3EmbedProvider, type S3EmbedConfig } from '../providers/S3EmbedProvider';
import { ObjectBrowser } from './ObjectBrowser';

const { mockApi, mockToast } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    delete: vi.fn(),
  },
  mockToast: vi.fn(),
}));

vi.mock('@/lib/embed-api', () => ({
  createEmbedApi: vi.fn(() => mockApi),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/components/ui/toaster', () => ({
  Toaster: () => null,
}));

vi.mock('@/components/embed/EmbedUploadDialog', () => ({
  EmbedUploadDialog: () => null,
}));

vi.mock('@/components/embed/EmbedCreateFolderDialog', () => ({
  EmbedCreateFolderDialog: () => null,
}));

vi.mock('@/components/embed/EmbedDeleteDialog', () => ({
  EmbedDeleteDialog: () => null,
}));

function renderObjectBrowser(
  configOverrides: Partial<S3EmbedConfig> = {},
  props: { bucket?: string } = {},
) {
  const config: S3EmbedConfig = {
    apiBase: '/s3-api',
    connectionId: 'conn-default',
    token: 'embed-token',
    ...configOverrides,
  };

  return render(
    <S3EmbedProvider config={config}>
      <ObjectBrowser {...props} />
    </S3EmbedProvider>,
  );
}

describe('ObjectBrowser', () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.delete.mockReset();
    mockToast.mockReset();
  });

  it('renders a loading state with explicit copy while objects are being fetched', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderObjectBrowser(
      {
        connectionId: 'conn-loading',
      },
      { bucket: 'reports' },
    );

    expect(screen.getByText(/Loading objects/i)).toBeInTheDocument();
    expect(screen.getByText(/Fetching contents for reports/i)).toBeInTheDocument();
  });

  it('renders an error state with the upstream failure message', async () => {
    mockApi.get.mockRejectedValue(new Error('Upstream object listing failed'));

    renderObjectBrowser(
      {
        connectionId: 'conn-error',
      },
      { bucket: 'reports' },
    );

    expect(await screen.findByText(/Unable to load objects/i)).toBeInTheDocument();
    expect(screen.getByText(/Upstream object listing failed/i)).toBeInTheDocument();
  });

  it('renders a clean empty-folder state', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          bucket: 'reports',
          prefix: '',
          commonPrefixes: ['incoming/'],
          objects: [],
          isTruncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          bucket: 'reports',
          prefix: 'incoming/',
          commonPrefixes: [],
          objects: [],
          isTruncated: false,
        },
      });
    const user = userEvent.setup();

    renderObjectBrowser(
      {
        connectionId: 'conn-empty-folder',
      },
      { bucket: 'reports' },
    );

    await user.click(await screen.findByText('incoming'));
    expect(await screen.findByRole('heading', { name: /This folder is empty/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Upload files or create another folder inside incoming/i),
    ).toBeInTheDocument();
  });

  it('shows read-only object browser controls correctly', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        bucket: 'reports',
        prefix: '',
        commonPrefixes: ['incoming/'],
        objects: [
          {
            key: 'report.csv',
            size: 1024,
            lastModified: '2026-03-11T08:00:00.000Z',
          },
        ],
        isTruncated: false,
      },
    });

    renderObjectBrowser(
      {
        connectionId: 'conn-readonly',
        readonly: true,
      },
      { bucket: 'reports' },
    );

    expect(await screen.findByText('report.csv')).toBeInTheDocument();
    expect(screen.getByText('incoming')).toBeInTheDocument();
    expect(screen.getByTitle('Download')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new folder/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('lets users drill into a folder and reset back to the bucket root breadcrumb', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          bucket: 'reports',
          prefix: '',
          commonPrefixes: ['incoming/'],
          objects: [],
          isTruncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          bucket: 'reports',
          prefix: 'incoming/',
          commonPrefixes: [],
          objects: [
            {
              key: 'incoming/report.csv',
              size: 2048,
              lastModified: '2026-03-11T08:00:00.000Z',
            },
          ],
          isTruncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          bucket: 'reports',
          prefix: '',
          commonPrefixes: ['incoming/'],
          objects: [],
          isTruncated: false,
        },
      });
    const user = userEvent.setup();

    renderObjectBrowser(
      {
        connectionId: 'conn-breadcrumb',
      },
      { bucket: 'reports' },
    );

    await user.click(await screen.findByText('incoming'));
    expect(await screen.findByText('report.csv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reports$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^reports$/i }));

    expect(await screen.findByText('incoming')).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/s3/conn-breadcrumb/objects?bucket=reports&prefix=incoming%2F');
    expect(screen.queryByText('report.csv')).not.toBeInTheDocument();
  });
});
