import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { S3EmbedProvider, type S3EmbedConfig } from '../providers/S3EmbedProvider';
import { BucketExplorer } from './BucketExplorer';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/embed-api', () => ({
  createEmbedApi: vi.fn(() => mockApi),
}));

vi.mock('./ObjectBrowser', () => ({
  ObjectBrowser: ({ bucket }: { bucket?: string }) => (
    <div data-testid="object-browser">Object browser for {bucket ?? 'unknown'}</div>
  ),
}));

vi.mock('@/components/ui/toaster', () => ({
  Toaster: () => null,
}));

function renderBucketExplorer(configOverrides: Partial<S3EmbedConfig> = {}) {
  const config: S3EmbedConfig = {
    apiBase: '/s3-api',
    connectionId: 'conn-default',
    token: 'embed-token',
    ...configOverrides,
  };

  return render(
    <S3EmbedProvider config={config}>
      <BucketExplorer />
    </S3EmbedProvider>,
  );
}

describe('BucketExplorer', () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.delete.mockReset();
  });

  it('shows the bucket list when no bucket is preselected', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        buckets: [{ name: 'photos', creationDate: '2026-03-11T00:00:00.000Z' }],
      },
    });

    renderBucketExplorer({ connectionId: 'conn-list' });

    expect(await screen.findByText('photos')).toBeInTheDocument();
    expect(screen.queryByTestId('object-browser')).not.toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith('/s3/conn-list/buckets');
  });

  it('goes directly to object browsing when a bucket is preselected', async () => {
    renderBucketExplorer({
      connectionId: 'conn-direct',
      bucket: 'archive',
    });

    expect(await screen.findByTestId('object-browser')).toHaveTextContent(
      'Object browser for archive',
    );
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
