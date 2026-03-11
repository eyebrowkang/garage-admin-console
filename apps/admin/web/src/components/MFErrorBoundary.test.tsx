import { render, screen, waitFor } from '@testing-library/react';
import { MFErrorBoundary } from './MFErrorBoundary';

function Boom(): never {
  throw new Error('mf failed');
}

function MaybeBoom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('mf failed');
  }

  return <div>remote ready</div>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the S3 Browser unavailable fallback', () => {
  render(
    <MFErrorBoundary>
      <Boom />
    </MFErrorBoundary>,
  );

  expect(screen.getByText(/S3 Browser not available/i)).toBeInTheDocument();
});

it('clears the fallback when the reset key changes', async () => {
  const { rerender } = render(
    <MFErrorBoundary resetKey="connection-1">
      <MaybeBoom shouldThrow />
    </MFErrorBoundary>,
  );

  expect(screen.getByText(/S3 Browser not available/i)).toBeInTheDocument();

  rerender(
    <MFErrorBoundary resetKey="connection-2">
      <MaybeBoom shouldThrow={false} />
    </MFErrorBoundary>,
  );

  await waitFor(() => {
    expect(screen.getByText('remote ready')).toBeInTheDocument();
  });
});
