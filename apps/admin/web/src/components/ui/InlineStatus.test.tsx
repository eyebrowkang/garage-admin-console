import { render, screen } from '@testing-library/react';
import { InlineStatus } from '@garage-admin/ui';

it('renders success inline status with semantic token classes', () => {
  render(<InlineStatus tone="success">Copied!</InlineStatus>);

  expect(screen.getByText(/Copied!/i).className).toContain('text-success');
});

it('renders muted inline status by default', () => {
  render(<InlineStatus>Waiting</InlineStatus>);

  expect(screen.getByText(/Waiting/i).className).toContain('text-muted-foreground');
});
