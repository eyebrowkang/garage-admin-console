import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ResourceList, type ResourceListColumn } from './resource-list';
import { Badge } from './badge';

interface Row {
  id: string;
  name: string;
  n: number;
}

const ITEMS: Row[] = [
  { id: 'a', name: 'Banana', n: 2 },
  { id: 'b', name: 'Apple', n: 1 },
  { id: 'c', name: 'Cherry', n: 3 },
];

const COLUMNS: ResourceListColumn<Row>[] = [
  { id: 'name', header: 'Name', sortable: true, sortAccessor: (r) => r.name, cell: (r) => r.name },
  {
    id: 'n',
    header: 'Count',
    sortable: true,
    sortAccessor: (r) => r.n,
    cell: (r) => <Badge>{r.n}</Badge>,
  },
];

function renderList(props: Partial<React.ComponentProps<typeof ResourceList<Row>>> = {}) {
  return render(
    <ResourceList
      items={ITEMS}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      renderTitle={(r) => r.name}
      emptyState={{ icon: Badge as never, title: 'Nothing here', description: 'Add something.' }}
      {...props}
    />,
  );
}

/** Row labels from the desktop table body, in DOM order. */
function tableRowNames() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1) // drop the header row
    .map((row) => row.textContent ?? '');
}

describe('ResourceList', () => {
  it('renders every item in the desktop table', () => {
    renderList();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Banana')).toBeInTheDocument();
    expect(within(table).getByText('Apple')).toBeInTheDocument();
    expect(within(table).getByText('Cherry')).toBeInTheDocument();
  });

  it('filters via the built-in search', async () => {
    const user = userEvent.setup();
    renderList({
      search: { placeholder: 'Search', predicate: (r, q) => r.name.toLowerCase().includes(q) },
    });
    await user.type(screen.getByRole('textbox'), 'app');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Apple')).toBeInTheDocument();
    expect(within(table).queryByText('Banana')).not.toBeInTheDocument();
  });

  it('shows the search-miss state without the empty CTA', async () => {
    const user = userEvent.setup();
    renderList({
      search: { placeholder: 'Search', predicate: (r, q) => r.name.toLowerCase().includes(q) },
    });
    await user.type(screen.getByRole('textbox'), 'zzz');
    expect(screen.getAllByText('No matches').length).toBeGreaterThan(0);
  });

  it('renders the empty state when there are no items', () => {
    renderList({ items: [] });
    expect(screen.getAllByText('Nothing here').length).toBeGreaterThan(0);
  });

  it('toggles sort order when a sortable header is clicked', async () => {
    const user = userEvent.setup();
    renderList();
    // Default: source order (Banana, Apple, Cherry).
    expect(tableRowNames()[0]).toContain('Banana');
    // Sort ascending by name.
    await user.click(screen.getByRole('columnheader', { name: /Name/ }));
    expect(tableRowNames().map((t) => t.replace(/\d/g, ''))).toEqual([
      'Apple',
      'Banana',
      'Cherry',
    ]);
    // Click again -> descending.
    await user.click(screen.getByRole('columnheader', { name: /Name/ }));
    expect(tableRowNames()[0]).toContain('Cherry');
  });

  it('surfaces a bulk-action bar with the live selection count', async () => {
    const user = userEvent.setup();
    renderList({
      selection: {
        renderActions: (selected) => <button type="button">Delete {selected.length}</button>,
      },
    });
    await user.click(screen.getByRole('checkbox', { name: /select all/i }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 3' })).toBeInTheDocument();
  });
});
