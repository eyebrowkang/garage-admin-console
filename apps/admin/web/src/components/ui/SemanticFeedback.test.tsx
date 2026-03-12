import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle, Badge } from '@garage-admin/ui';

it('uses semantic success tokens for success badges', () => {
  render(<Badge variant="success">Healthy</Badge>);

  expect(screen.getByText(/Healthy/i).className).toContain('bg-success-soft');
  expect(screen.getByText(/Healthy/i).className).toContain('text-success');
});

it('uses semantic warning tokens for warning alerts', () => {
  render(
    <Alert variant="warning">
      <AlertTitle>Degraded</AlertTitle>
      <AlertDescription>Review the cluster.</AlertDescription>
    </Alert>,
  );

  expect(screen.getByRole('alert').className).toContain('border-warning-border');
  expect(screen.getByRole('alert').className).toContain('bg-warning-soft');
  expect(screen.getByRole('alert').className).toContain('text-warning-foreground');
});
