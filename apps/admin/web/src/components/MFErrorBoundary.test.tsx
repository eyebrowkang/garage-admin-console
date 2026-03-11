import { render, screen } from '@testing-library/react';
import { MFErrorBoundary } from './MFErrorBoundary';

function Boom() {
  throw new Error('mf failed');
}

it('renders the S3 Browser unavailable fallback', () => {
  render(
    <MFErrorBoundary>
      <Boom />
    </MFErrorBoundary>,
  );

  expect(screen.getByText(/S3 Browser not available/i)).toBeInTheDocument();
});
