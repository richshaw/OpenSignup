// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginForm, type LoginActionResult, type LoginErrorReason } from './login-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function renderForm(action: (formData: FormData) => Promise<LoginActionResult>) {
  render(
    <LoginForm
      action={action}
      redeem={async () => ({ ok: false, message: 'Invalid code' })}
      callbackUrl="/app"
    />,
  );
  return screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;
}

describe('LoginForm email', () => {
  it.each<LoginErrorReason>(['invalid_email', 'send_failed', 'rate_limited'])(
    'keeps the entered email after %s',
    async (reason) => {
      const email = renderForm(async () => ({ ok: false, reason }));
      fireEvent.change(email, { target: { value: 'person+tag@example.com' } });
      fireEvent.submit(email.form!);

      await screen.findByRole('alert');
      expect(email).toHaveValue('person+tag@example.com');
      expect(email).not.toBeDisabled();
      fireEvent.change(email, { target: { value: 'corrected@example.com' } });
      expect(email).toHaveValue('corrected@example.com');
    },
  );

  it('keeps the entered email when the action throws', async () => {
    const email = renderForm(async () => {
      throw new Error('Network unavailable');
    });
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.submit(email.form!);

    await screen.findByRole('alert');
    expect(email).toHaveValue('person@example.com');
  });

  it('submits the corrected email after a failed attempt', async () => {
    const submitted: FormDataEntryValue[] = [];
    const email = renderForm(async (formData) => {
      submitted.push(formData.get('email')!);
      return { ok: false, reason: 'invalid_email' };
    });
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.submit(email.form!);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(email).toHaveValue('not-an-email');

    fireEvent.change(email, { target: { value: 'corrected@example.com' } });
    fireEvent.submit(email.form!);
    await screen.findByRole('alert');
    expect(submitted).toEqual(['not-an-email', 'corrected@example.com']);
  });

  it('clears the input after success and keeps the confirmed address for code sign-in', async () => {
    const email = renderForm(async () => ({ ok: true, email: 'person@example.com' }));
    fireEvent.change(email, { target: { value: 'Person@example.com' } });
    fireEvent.submit(email.form!);

    await screen.findByRole('button', { name: 'Sent — check your email' });
    expect(email).toHaveValue('');
    expect(email).toBeDisabled();
    expect(screen.getByText('person@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('123456').closest('form')).toHaveFormValues({
      email: 'person@example.com',
      code: '',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(email).toHaveValue('');
    expect(email).not.toBeDisabled();
    await waitFor(() => expect(email).toHaveFocus());
  });
});
