import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
