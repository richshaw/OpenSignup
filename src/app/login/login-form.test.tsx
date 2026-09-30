// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LoginForm, type CodeActionResult, type LoginActionResult, type LoginErrorReason } from './login-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function renderForm(
  action: (formData: FormData) => Promise<LoginActionResult>,
  redeem: (formData: FormData) => Promise<CodeActionResult> = async () => ({ ok: false, message: 'Invalid code' }),
) {
  render(
    <LoginForm
      action={action}
      redeem={redeem}
      callbackUrl="/app"
    />,
  );
  return screen.getByRole('textbox', { name: 'Email' }) as HTMLInputElement;
}

describe('LoginForm email', () => {
  it('replays a submission queued before hydration without clearing the failed input', async () => {
    const action = vi.fn(async (_formData: FormData) => ({ ok: false, reason: 'invalid_email' } as const));
    const form = <LoginForm action={action} redeem={async () => ({ ok: false, message: 'Invalid code' })} callbackUrl="/app" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(form);
    document.body.appendChild(container);
    const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
    const script = container.querySelector('script')!.textContent!;
    let submitListener: EventListener | undefined;
    // Run React's actual SSR submit listener, rather than constructing its replay queue.
    new Function('addEventListener', script)((type: string, listener: EventListener) => {
      submitListener = listener;
      window.addEventListener(type, listener);
    });
    try {
      email.value = 'queued-before-hydration@example.com';
      expect(fireEvent.submit(email.form!)).toBe(false);
      expect(action).not.toHaveBeenCalled();
      render(form, { container, hydrate: true });

      await screen.findByRole('alert');
      expect(action.mock.calls[0]?.[0].get('email')).toBe('queued-before-hydration@example.com');
      expect(email).toHaveValue('queued-before-hydration@example.com');
    } finally {
      if (submitListener) window.removeEventListener('submit', submitListener);
    }
  });

  it('preserves input entered before hydration through a failed submission', async () => {
    const action = vi.fn(async (_formData: FormData) => ({ ok: false, reason: 'invalid_email' } as const));
    const form = <LoginForm action={action} redeem={async () => ({ ok: false, message: 'Invalid code' })} callbackUrl="/app" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(form);
    document.body.appendChild(container);
    expect(container.querySelector('form')?.getAttribute('action')).toMatch(/^javascript:/);
    const email = container.querySelector<HTMLInputElement>('input[name="email"]')!;
    email.value = 'typed-before-hydration@example.com';
    render(form, { container, hydrate: true });
    fireEvent.submit(email.form!);

    await screen.findByRole('alert');
    expect(action.mock.calls[0]?.[0].get('email')).toBe('typed-before-hydration@example.com');
    expect(email).toHaveValue('typed-before-hydration@example.com');
  });

  it('keeps and submits a value filled without a React change event', async () => {
    const action = vi.fn(async (_formData: FormData) => ({ ok: false, reason: 'invalid_email' } as const));
    const email = renderForm(action);
    email.value = 'filled-before-hydration@example.com';
    fireEvent.submit(email.form!);

    await screen.findByRole('alert');
    expect(action.mock.calls[0]?.[0].get('email')).toBe('filled-before-hydration@example.com');
    expect(email).toHaveValue('filled-before-hydration@example.com');
  });

  it('sends a corrected address after a rate-limited response', async () => {
    const submitted: FormDataEntryValue[] = [];
    const email = renderForm(async (formData) => {
      submitted.push(formData.get('email')!);
      return { ok: false, reason: 'rate_limited' };
    });
    fireEvent.change(email, { target: { value: 'person@example.con' } });
    fireEvent.submit(email.form!);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Send magic link' })).not.toBeDisabled();

    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.submit(email.form!);
    // aria-disabled only, so the button keeps keyboard focus while sending.
    const sending = screen.getByRole('button', { name: 'Sending…' });
    expect(sending).not.toBeDisabled();
    expect(sending).toHaveAttribute('aria-disabled', 'true');
    await screen.findByRole('alert');
    expect(submitted).toEqual(['person@example.con', 'person@example.com']);
  });

  it('retains code edits made during a pending request and blocks duplicate submits', async () => {
    let resolve: (result: CodeActionResult) => void = () => {};
    const redeem = vi.fn(() => new Promise<CodeActionResult>((done) => { resolve = done; }));
    const email = renderForm(async () => ({ ok: true, email: 'person@example.com' }), redeem);
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.submit(email.form!);
    const code = await screen.findByPlaceholderText('123456') as HTMLInputElement;
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.submit(code.form!);
    await screen.findByRole('button', { name: 'Checking…' });
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.submit(code.form!);
    resolve({ ok: false, message: 'Invalid code' });

    await screen.findByText('Invalid code');
    expect(redeem).toHaveBeenCalledTimes(1);
    expect(code).toHaveValue('654321');
  });

  it('retains the code when redeeming throws', async () => {
    const email = renderForm(async () => ({ ok: true, email: 'person@example.com' }), async () => {
      throw new Error('Network unavailable');
    });
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.submit(email.form!);
    const code = await screen.findByPlaceholderText('123456') as HTMLInputElement;
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.submit(code.form!);

    await screen.findByText('Something went wrong. Try again.');
    expect(code).toHaveValue('123456');
  });

  it('keeps a rejected code and submits its corrected value', async () => {
    const submitted: FormDataEntryValue[] = [];
    const redeem = vi.fn(async (formData: FormData) => {
      submitted.push(formData.get('code')!);
      return { ok: false, message: 'Invalid code' } as const;
    });
    const email = renderForm(async () => ({ ok: true, email: 'person@example.com' }), redeem);
    fireEvent.change(email, { target: { value: 'person@example.com' } });
    fireEvent.submit(email.form!);
    const code = await screen.findByPlaceholderText('123456') as HTMLInputElement;
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.submit(code.form!);
    await screen.findByText('Invalid code');
    expect(code).toHaveValue('000000');

    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.submit(code.form!);
    await waitFor(() => expect(redeem).toHaveBeenCalledTimes(2));
    expect(submitted).toEqual(['000000', '123456']);
  });

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
