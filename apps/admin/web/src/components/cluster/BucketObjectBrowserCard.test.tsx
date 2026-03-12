import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BucketObjectBrowserCard } from './BucketObjectBrowserCard';
import type { BucketKeyPerm } from '@/types/garage';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value: () => false,
    },
    setPointerCapture: {
      configurable: true,
      value: () => {},
    },
    releasePointerCapture: {
      configurable: true,
      value: () => {},
    },
    scrollIntoView: {
      configurable: true,
      value: () => {},
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createKey({
  accessKeyId,
  name,
  read,
  write,
}: {
  accessKeyId: string;
  name: string;
  read: boolean;
  write: boolean;
}): BucketKeyPerm {
  return {
    accessKeyId,
    name,
    permissions: {
      read,
      write,
      owner: false,
    },
  };
}

function PassthroughEmbedProvider({
  children,
}: {
  config: {
    apiBase: string;
    bucket?: string;
    connectionId: string;
    readonly?: boolean;
    token?: string;
  };
  children: ReactNode;
}) {
  return <>{children}</>;
}

function DummyObjectBrowser({ bucket }: { bucket?: string }) {
  return <div>Browsing {bucket}</div>;
}

async function selectAccessKey(name: RegExp | string) {
  const user = userEvent.setup();

  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name }));
}

it('renders a degraded message when no readable key exists', () => {
  render(
    <BucketObjectBrowserCard
      bucketId="bucket-1"
      clusterId="cluster-1"
      keys={[
        createKey({
          accessKeyId: 'key-no-read',
          name: 'No Read Key',
          read: false,
          write: false,
        }),
      ]}
    />,
  );

  expect(screen.getByText(/Object browsing unavailable/i)).toBeInTheDocument();
  expect(
    screen.getByText(/does not have any access key with read permission/i),
  ).toBeInTheDocument();
});

it('passes readonly=true into the embedded remote config for a read-only key', async () => {
  const connectToBucketBrowser = vi.fn().mockResolvedValue({
    apiBase: '/ignored',
    bucketName: 'photos',
    connectionId: 'connection-1',
    token: 'bridge-token',
  });
  const receivedConfigs: Array<{
    apiBase: string;
    bucket?: string;
    connectionId: string;
    readonly?: boolean;
    token?: string;
  }> = [];
  const user = userEvent.setup();

  function InspectingEmbedProvider({
    config,
    children,
  }: {
    config: {
      apiBase: string;
      bucket?: string;
      connectionId: string;
      readonly?: boolean;
      token?: string;
    };
    children: ReactNode;
  }) {
    receivedConfigs.push(config);
    return <>{children}</>;
  }

  render(
    <BucketObjectBrowserCard
      bucketId="bucket-1"
      clusterId="cluster-1"
      connectToBucketBrowser={connectToBucketBrowser}
      EmbedProvider={InspectingEmbedProvider}
      ObjectBrowser={DummyObjectBrowser}
      keys={[
        createKey({
          accessKeyId: 'key-readonly',
          name: 'Read Only Key',
          read: true,
          write: false,
        }),
        createKey({
          accessKeyId: 'key-readwrite',
          name: 'Read Write Key',
          read: true,
          write: true,
        }),
      ]}
    />,
  );

  await selectAccessKey(/Read Only Key/i);
  await user.click(screen.getByRole('button', { name: /Browse Objects/i }));

  await waitFor(() => {
    expect(connectToBucketBrowser).toHaveBeenCalledWith({
      accessKeyId: 'key-readonly',
      bucketId: 'bucket-1',
      clusterId: 'cluster-1',
    });
  });

  expect(receivedConfigs.at(-1)).toMatchObject({
    apiBase: '/s3-api',
    bucket: 'photos',
    connectionId: 'connection-1',
    readonly: true,
    token: 'bridge-token',
  });
  expect(screen.getByText('Browsing photos')).toBeInTheDocument();
});

it('shows a clear access summary for the selected key before connecting', async () => {
  render(
    <BucketObjectBrowserCard
      bucketId="bucket-1"
      clusterId="cluster-1"
      keys={[
        createKey({
          accessKeyId: 'key-readonly',
          name: 'Read Only Key',
          read: true,
          write: false,
        }),
        createKey({
          accessKeyId: 'key-readwrite',
          name: 'Read Write Key',
          read: true,
          write: true,
        }),
      ]}
    />,
  );

  await selectAccessKey(/Read Only Key/i);
  expect(
    screen.getByText(/can browse objects but cannot upload, rename, or delete/i),
  ).toBeInTheDocument();

  await selectAccessKey(/Read Write Key/i);
  expect(screen.getByText(/can browse and change objects in this bucket/i)).toBeInTheDocument();
});

it('shows the MF fallback when the remote fails to load', async () => {
  const connectToBucketBrowser = vi.fn().mockResolvedValue({
    apiBase: '/ignored',
    bucketName: 'photos',
    connectionId: 'connection-1',
    token: 'bridge-token',
  });
  const user = userEvent.setup();

  function BrokenObjectBrowser(): never {
    throw new Error('remote failed');
  }

  render(
    <BucketObjectBrowserCard
      bucketId="bucket-1"
      clusterId="cluster-1"
      connectToBucketBrowser={connectToBucketBrowser}
      EmbedProvider={PassthroughEmbedProvider}
      ObjectBrowser={BrokenObjectBrowser}
      keys={[
        createKey({
          accessKeyId: 'key-readonly',
          name: 'Read Only Key',
          read: true,
          write: false,
        }),
      ]}
    />,
  );

  await selectAccessKey(/Read Only Key/i);
  await user.click(screen.getByRole('button', { name: /Browse Objects/i }));

  expect(await screen.findByText(/S3 Browser not available/i)).toBeInTheDocument();
});

it('clears the MF fallback after reconnecting with a new reset key', async () => {
  const connectToBucketBrowser = vi
    .fn()
    .mockResolvedValueOnce({
      apiBase: '/ignored',
      bucketName: 'broken-bucket',
      connectionId: 'connection-1',
      token: 'bridge-token',
    })
    .mockResolvedValueOnce({
      apiBase: '/ignored',
      bucketName: 'healthy-bucket',
      connectionId: 'connection-2',
      token: 'bridge-token',
    });
  const user = userEvent.setup();

  function FlakyObjectBrowser({ bucket }: { bucket?: string }) {
    if (bucket === 'broken-bucket') {
      throw new Error('remote failed');
    }

    return <div>Browsing {bucket}</div>;
  }

  render(
    <BucketObjectBrowserCard
      bucketId="bucket-1"
      clusterId="cluster-1"
      connectToBucketBrowser={connectToBucketBrowser}
      EmbedProvider={PassthroughEmbedProvider}
      ObjectBrowser={FlakyObjectBrowser}
      keys={[
        createKey({
          accessKeyId: 'key-readonly',
          name: 'Read Only Key',
          read: true,
          write: false,
        }),
      ]}
    />,
  );

  await selectAccessKey(/Read Only Key/i);
  await user.click(screen.getByRole('button', { name: /Browse Objects/i }));

  expect(await screen.findByText(/S3 Browser not available/i)).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Disconnect/i }));
  await user.click(screen.getByRole('button', { name: /Browse Objects/i }));

  await waitFor(() => {
    expect(screen.getByText('Browsing healthy-bucket')).toBeInTheDocument();
  });
  expect(screen.queryByText(/S3 Browser not available/i)).not.toBeInTheDocument();
});
