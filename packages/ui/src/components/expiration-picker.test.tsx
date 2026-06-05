import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ExpirationPicker } from './expiration-picker';

function setup(overrides: Partial<React.ComponentProps<typeof ExpirationPicker>> = {}) {
  const props = {
    date: '',
    hour: '00',
    minute: '00',
    neverExpires: false,
    onDateChange: vi.fn(),
    onHourChange: vi.fn(),
    onMinuteChange: vi.fn(),
    onNeverExpiresChange: vi.fn(),
    ...overrides,
  };
  render(<ExpirationPicker {...props} />);
  return props;
}

describe('ExpirationPicker', () => {
  it('hides the custom date/time fields until "Custom" is chosen', async () => {
    const user = userEvent.setup();
    setup({ allowDefault: true });
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    // The native date input is now revealed.
    expect(document.querySelector('input[type="date"]')).toBeInTheDocument();
  });

  it('a day preset writes a future date through the value props', async () => {
    const user = userEvent.setup();
    const props = setup({ allowDefault: true });
    await user.click(screen.getByRole('button', { name: '30 days' }));
    expect(props.onNeverExpiresChange).toHaveBeenCalledWith(false);
    expect(props.onDateChange).toHaveBeenCalledTimes(1);
    const written = props.onDateChange.mock.calls[0][0] as string;
    expect(written).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Roughly 30 days out (allow a day of slack for tz/rounding).
    const days = (new Date(written).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(32);
  });

  it('seeds the current date when entering Custom from empty', async () => {
    const user = userEvent.setup();
    const props = setup({ allowDefault: true });
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(props.onDateChange).toHaveBeenCalledWith(
      `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    );
  });

  it('keeps an existing date when re-selecting Custom', async () => {
    const user = userEvent.setup();
    const props = setup({ date: '2030-01-01', hour: '08', minute: '30' });
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(props.onDateChange).not.toHaveBeenCalled();
  });

  it('"Never" drives neverExpires and "Default" clears the override', async () => {
    const user = userEvent.setup();
    const props = setup({ allowDefault: true });
    await user.click(screen.getByRole('button', { name: 'Never' }));
    expect(props.onNeverExpiresChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Default' }));
    expect(props.onDateChange).toHaveBeenLastCalledWith('');
    expect(props.onNeverExpiresChange).toHaveBeenLastCalledWith(false);
  });

  it('omits the Default preset unless allowDefault is set (edit dialogs)', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Default' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Never' })).toBeInTheDocument();
  });
});
