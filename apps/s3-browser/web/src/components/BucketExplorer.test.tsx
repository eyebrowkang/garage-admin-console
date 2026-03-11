import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders a loading state with clear copy while buckets are being fetched', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderBucketExplorer({ connectionId: 'conn-loading' });

    expect(screen.getByText(/Loading buckets/i)).toBeInTheDocument();
    expect(screen.getByText(/Fetching buckets from this connection/i)).toBeInTheDocument();
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

  it('allows returning from object browsing back to the bucket list', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        buckets: [{ name: 'photos', creationDate: '2026-03-11T00:00:00.000Z' }],
      },
    });
    const user = userEvent.setup();

    renderBucketExplorer({ connectionId: 'conn-back' });

    await user.click(await screen.findByText('photos'));
    expect(await screen.findByTestId('object-browser')).toHaveTextContent(
      'Object browser for photos',
    );

    await user.click(screen.getByRole('button', { name: /Back to buckets/i }));

    expect(await screen.findByText('photos')).toBeInTheDocument();
    expect(screen.queryByTestId('object-browser')).not.toBeInTheDocument();
  });

  it('renders a clean empty state when the connection has no visible buckets', async () => {
    mockApi.get.mockResolvedValue({
      data: {
        buckets: [],
      },
    });

    renderBucketExplorer({ connectionId: 'conn-empty' });

    expect(await screen.findByRole('heading', { name: /No buckets available/i })).toBeInTheDocument();
    expect(
      screen.getByText(/This connection does not currently expose any buckets/i),
    ).toBeInTheDocument();
  });

  it('renders an error state with the upstream message when bucket loading fails', async () => {
    mockApi.get.mockRejectedValue(new Error('S3 endpoint timed out'));

    renderBucketExplorer({ connectionId: 'conn-error' });

    expect(await screen.findByText(/Unable to load buckets/i)).toBeInTheDocument();
    expect(screen.getByText(/S3 endpoint timed out/i)).toBeInTheDocument();
  });
});
