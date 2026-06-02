import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The BrowserProvider builds its HTTP client via axios.create(); intercept it
// so the whole FileBrowser runs against an in-memory /list backend.
const { getMock, fakeAxios } = vi.hoisted(() => {
  const getMock = vi.fn();
  return { getMock, fakeAxios: { get: getMock, post: vi.fn(), defaults: { baseURL: '' } } };
});

vi.mock('axios', () => ({
  default: { create: () => fakeAxios, isAxiosError: () => false },
}));

// react-arborist needs real layout measurement that jsdom can't provide. Stub
// the tree sidebar so the smoke test exercises the data-driven surface
// (breadcrumb + folder view + dialogs) without it.
vi.mock('../file-browser/components/tree/TreePane', () => ({ TreePane: () => null }));

import FileBrowser from '../file-browser/FileBrowser';

const BASE_URL = '/api/connections/c1/buckets/my-bucket';

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  fakeAxios.defaults.baseURL = BASE_URL;
  getMock.mockReset();
  getMock.mockResolvedValue({ data: { objects: [], prefixes: [] } });
});

afterEach(() => vi.clearAllMocks());

function renderBrowser(overrides: Partial<ComponentProps<typeof FileBrowser>> = {}) {
  const onPathChange = vi.fn();
  render(
    <FileBrowser
      backend={{ baseUrl: BASE_URL, authToken: 'jwt' }}
      bucket="my-bucket"
      path={[]}
      onPathChange={onPathChange}
      {...overrides}
    />,
  );
  return { onPathChange };
}

describe('FileBrowser — integration smoke', () => {
  it('mounts, fires the /list query for the root prefix, and renders the empty state', async () => {
    renderBrowser();

    // Breadcrumb root button proves the whole tree mounted.
    expect(screen.getByRole('button', { name: /my-bucket root/i })).toBeInTheDocument();

    // The query resolves to an empty page → empty-folder state.
    expect(await screen.findByText('Empty folder')).toBeInTheDocument();

    // Data wiring: GET /list was issued for the bucket root.
    expect(getMock).toHaveBeenCalledWith(
      '/list',
      expect.objectContaining({ params: expect.objectContaining({ prefix: '' }) }),
    );
  });

  it('renders the count of folders and files returned by /list', async () => {
    getMock.mockResolvedValue({
      data: {
        objects: [
          { key: 'readme.txt', size: 10, etag: 'e', lastModified: null, storageClass: null },
        ],
        prefixes: ['photos/'],
      },
    });
    renderBrowser();

    // 1 folder + 1 file = 2 items (the count line is not virtualized).
    expect(await screen.findByText('2', { selector: 'strong' })).toBeInTheDocument();
  });

  it('navigates to the bucket root when the breadcrumb is clicked', async () => {
    const { onPathChange } = renderBrowser({ path: ['photos'] });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /my-bucket root/i }));
    expect(onPathChange).toHaveBeenCalledWith([]);
  });

  it('opens the upload dialog from the toolbar', async () => {
    renderBrowser();
    await screen.findByText('Empty folder'); // let the initial query settle

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /upload/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
