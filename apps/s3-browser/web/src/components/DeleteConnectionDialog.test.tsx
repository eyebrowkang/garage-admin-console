import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DeleteConnectionDialog } from './DeleteConnectionDialog';

it('wraps long connection names safely in the delete confirmation dialog', () => {
  const longName =
    'admin-bridge:beb2aae2-73d5-43fe-a24e-bc980b9f2080:d618e70a972f50b49fc81b2442d186f505e3b18ddf7ae13a5df26dc8986d445b:GK889049d7cc75a40f76d77c15';

  render(
    <DeleteConnectionDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      isLoading={false}
      connectionName={longName}
    />,
  );

  expect(screen.getByText(longName).className).toContain('break-all');
});
