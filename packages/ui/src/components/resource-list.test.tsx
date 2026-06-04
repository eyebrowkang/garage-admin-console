import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('toggles sort order via a keyboard-focusable header button', async () => {
    const user = userEvent.setup();
    renderList();
    // The sortable header is a real button (keyboard-operable), inside the th.
    const sortByName = () =>
      within(screen.getByRole('table')).getByRole('button', { name: /Name/ });
    // Default: source order (Banana, Apple, Cherry).
    expect(tableRowNames()[0]).toContain('Banana');
    // Sort ascending by name.
    await user.click(sortByName());
    expect(tableRowNames().map((t) => t.replace(/\d/g, ''))).toEqual(['Apple', 'Banana', 'Cherry']);
    // Click again -> descending.
    await user.click(sortByName());
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

  it('exposes navigable rows as keyboard-focusable links with a label', () => {
    renderList({ onRowClick: () => {}, getRowLabel: (r) => `Open ${r.name}` });
    const row = within(screen.getByRole('table')).getByRole('link', { name: 'Open Apple' });
    expect(row).toHaveAttribute('tabindex', '0');
  });

  it('activates row navigation on Enter, but not from a nested control', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderList({
      onRowClick,
      getRowLabel: (r) => `Open ${r.name}`,
      rowActions: () => <button type="button">Delete</button>,
    });
    const table = screen.getByRole('table');
    // Enter on the row itself navigates.
    const row = within(table).getByRole('link', { name: 'Open Banana' });
    row.focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(1);
    // Enter on a nested Delete button does NOT also navigate.
    onRowClick.mockClear();
    within(row).getByRole('button', { name: 'Delete' }).focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders a mobileSubtitle column without a label, keeping labels for others', () => {
    const cols: ResourceListColumn<Row>[] = [
      { id: 'name', header: 'Name', mobileHidden: true, cell: (r) => r.name },
      { id: 'sid', header: 'Secret ID', mobileSubtitle: true, cell: (r) => `sid-${r.id}` },
      { id: 'n', header: 'Count', cell: (r) => String(r.n) },
    ];
    renderList({ columns: cols });
    // <dt> labels exist only in the mobile card: the subtitle column has none,
    // the ordinary column keeps its label.
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toContain('Count');
    expect(terms).not.toContain('Secret ID');
    // The subtitle value is still rendered.
    expect(screen.getAllByText('sid-a').length).toBeGreaterThan(0);
  });

  it('opens the action sheet with the row identity and its actions', async () => {
    const user = userEvent.setup();
    renderList({
      renderTitle: (r) => r.name,
      rowActions: (r) => <button type="button">Delete {r.name}</button>,
    });
    // Each mobile card has a "Row actions" trigger; open the first (Banana).
    await user.click(screen.getAllByRole('button', { name: /row actions/i })[0]);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Actions')).toBeInTheDocument();
    expect(within(sheet).getByText('Banana')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Delete Banana' })).toBeInTheDocument();
  });
});
