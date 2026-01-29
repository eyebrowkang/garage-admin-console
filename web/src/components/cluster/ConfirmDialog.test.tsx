import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
  };

  it('renders title and description', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked (simple tier)', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} tier="simple" onConfirm={onConfirm} />);

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange when cancel button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows custom confirm text', () => {
    render(<ConfirmDialog {...defaultProps} confirmText="Delete Forever" />);
    expect(screen.getByRole('button', { name: /delete forever/i })).toBeInTheDocument();
  });

  it('disables confirm button and shows loading text when loading', () => {
    render(<ConfirmDialog {...defaultProps} isLoading />);
    // When loading, button text changes to "Processing..."
    const confirmButton = screen.getByRole('button', { name: /processing/i });
    expect(confirmButton).toBeDisabled();
  });

  it('requires type-to-confirm input for type-to-confirm tier', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...defaultProps}
        tier="type-to-confirm"
        typeToConfirmValue="DELETE"
        onConfirm={onConfirm}
      />,
    );

    // Confirm button should be disabled initially
    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    // The placeholder is the typeToConfirmValue itself
    const input = screen.getByPlaceholderText('DELETE');
    await userEvent.type(input, 'DELETE');

    // Now confirm button should be enabled
    expect(confirmButton).not.toBeDisabled();

    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows danger styling for danger tier', () => {
    render(<ConfirmDialog {...defaultProps} tier="danger" />);
    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    // Check that the button has destructive variant class
    expect(confirmButton.className).toContain('destructive');
  });
});
