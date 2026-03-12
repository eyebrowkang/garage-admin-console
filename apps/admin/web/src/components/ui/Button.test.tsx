import { render, screen } from '@testing-library/react';
import { Button } from '@garage-admin/ui';

it('keeps default buttons touch-friendly on mobile while preserving compact desktop sizing', () => {
  render(<Button>Connect Cluster</Button>);

  expect(screen.getByRole('button', { name: /Connect Cluster/i }).className).toContain('h-11');
  expect(screen.getByRole('button', { name: /Connect Cluster/i }).className).toContain('sm:h-9');
});

it('keeps small buttons touch-friendly on mobile while preserving compact desktop sizing', () => {
  render(<Button size="sm">Edit</Button>);

  expect(screen.getByRole('button', { name: /Edit/i }).className).toContain('h-11');
  expect(screen.getByRole('button', { name: /Edit/i }).className).toContain('sm:h-8');
});
