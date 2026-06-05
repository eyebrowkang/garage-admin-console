import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '../components/login-form';

function renderForm(
  onSubmit: (password: string) => Promise<void> = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <LoginForm
      logoSrc="/logo.svg"
      logoAlt="Logo"
      title="Sign in to Garage"
      description="Admin console"
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

describe('LoginForm', () => {
  it('renders the branding and password form', () => {
    renderForm();
    expect(screen.getByText('Sign in to Garage')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('disables submit until a password is entered', async () => {
    const user = userEvent.setup();
    renderForm();
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    expect(button).toBeEnabled();
  });

  it('submits the typed password', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onSubmit).toHaveBeenCalledWith('hunter2');
  });

  it.each([401, 403])('maps a %d response to "Incorrect password"', async (status) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue({ response: { status } });
    renderForm(onSubmit);
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument();
  });

  it('maps other errors to a generic failure message', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    renderForm(onSubmit);
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/login failed/i)).toBeInTheDocument();
  });

  it('renders a custom footer when provided', () => {
    render(
      <LoginForm
        logoSrc="/l.svg"
        logoAlt="L"
        title="T"
        description="D"
        onSubmit={vi.fn()}
        footer={<span>custom footer</span>}
      />,
    );
    expect(screen.getByText('custom footer')).toBeInTheDocument();
  });
});
