import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./layouts/MainLayout', async () => {
  const { Outlet } = await import('react-router-dom');

  return {
    MainLayout: function MockMainLayout() {
      return (
        <div data-testid="main-layout">
          <Outlet />
        </div>
      );
    },
  };
});

vi.mock('./layouts/ConnectionLayout', async () => {
  const { Outlet } = await import('react-router-dom');

  return {
    ConnectionLayout: function MockConnectionLayout() {
      return (
        <div data-testid="connection-layout">
          <Outlet />
        </div>
      );
    },
  };
});

vi.mock('./pages/Dashboard', () => ({
  Dashboard: () => <div>Dashboard Route</div>,
}));

vi.mock('./pages/BucketList', () => ({
  BucketList: () => <div>Bucket List Route</div>,
}));

vi.mock('./pages/ObjectBrowserPage', () => ({
  ObjectBrowserPage: () => <div>Object Browser Route</div>,
}));

async function renderAppAt(pathname: string, baseUrl: string, token?: string) {
  vi.resetModules();
  vi.stubEnv('BASE_URL', baseUrl);

  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }

  window.history.pushState({}, '', pathname);

  const { default: App } = await import('./App');
  return render(<App />);
}

describe('App routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('uses the configured basename for protected routes', async () => {
    await renderAppAt('/embedded/connections/conn-1', '/embedded/', 'token');

    expect(await screen.findByText('Bucket List Route')).toBeInTheDocument();
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('connection-layout')).toBeInTheDocument();
  });
});
