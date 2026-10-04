// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginForm, type CodeActionResult, type LoginActionResult } from './login-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

// The form holds its loading state for at least half a second.
const SETTLED = { timeout: 2000 };

function renderForm(
  result: LoginActionResult,
  redeemResult: CodeActionResult = { ok: false, message: 'That code is not right.' },
) {
  const action = vi.fn(async (_formData: FormData) => result);
  const redeem = vi.fn(async (_formData: FormData) => redeemResult);
  render(<LoginForm action={action} redeem={redeem} callbackUrl="/app" />);
  return {
    action,
    redeem,
    email: screen.getByLabelText('Email'),
    send: screen.getByRole('button', { name: 'Send magic link' }),
  };
}

function sentAddresses(action: ReturnType<typeof renderForm>['action']) {
  return action.mock.calls.map(([formData]) => formData.get('email'));
}

describe('<LoginForm />', () => {
  it('keeps the address after the rate limit and ignores a resubmit until it is edited', async () => {
    const { action, email, send } = renderForm({ ok: false, reason: 'rate_limited' });
    fireEvent.change(email, { target: { value: 'pat@example.com' } });
    fireEvent.click(send);

    expect(await screen.findByRole('alert', {}, SETTLED)).toHaveTextContent(
      'Too many sign-in requests',
    );
    expect(email).toHaveValue('pat@example.com');
    expect(email).toBeEnabled();
    expect(send).toHaveAttribute('aria-disabled', 'true');

    // Each request is charged to the IP first, so a second click sends nothing.
    await act(async () => {
      fireEvent.click(send);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(email).toHaveValue('pat@example.com');

    fireEvent.change(email, { target: { value: 'pat@example.org' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(send).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(send);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(sentAddresses(action)).toEqual(['pat@example.com', 'pat@example.org']);
  });

  it('keeps the address when the link could not be sent', async () => {
    const { email, send } = renderForm({ ok: false, reason: 'send_failed' });
    fireEvent.change(email, { target: { value: 'pat@example.com' } });
    fireEvent.click(send);

    expect(await screen.findByRole('alert', {}, SETTLED)).toHaveTextContent('Couldn’t send');
    expect(email).toHaveValue('pat@example.com');
    expect(send).toHaveAttribute('aria-disabled', 'false');
  });

  it('clears the error once the address is edited', async () => {
    const { email, send } = renderForm({ ok: false, reason: 'invalid_email' });
    fireEvent.change(email, { target: { value: 'pat@example' } });
    fireEvent.click(send);
    await screen.findByRole('alert', {}, SETTLED);

    fireEvent.change(email, { target: { value: 'pat@example.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(email).toHaveValue('pat@example.com');
  });

  // Typed before the page hydrated, or put back by the browser: the box has
  // text that no change event told React about.
  it('keeps an address React never saw typed', async () => {
    const { action, email, send } = renderForm({ ok: false, reason: 'send_failed' });
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(email, 'pat@example.com');
    fireEvent.click(send);

    await screen.findByRole('alert', {}, SETTLED);
    expect(sentAddresses(action)).toEqual(['pat@example.com']);
    expect(email).toHaveValue('pat@example.com');
  });

  it('empties the box once a link is sent', async () => {
    const { email, send } = renderForm({ ok: true, email: 'pat@example.com' });
    fireEvent.change(email, { target: { value: 'pat@example.com' } });
    fireEvent.click(send);

    expect(await screen.findByText(/Link sent to/, {}, SETTLED)).toHaveTextContent(
      'pat@example.com',
    );
    expect(email).toHaveValue('');
  });

  it('keeps a wrong code in the box so one digit can be fixed', async () => {
    const { email, send, redeem } = renderForm({ ok: true, email: 'pat@example.com' });
    fireEvent.change(email, { target: { value: 'pat@example.com' } });
    fireEvent.click(send);
    const code = await screen.findByPlaceholderText('123456', {}, SETTLED);

    fireEvent.change(code, { target: { value: '123465' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(redeem).toHaveBeenCalledOnce();
    expect(code).toHaveValue('123465');
  });
});
