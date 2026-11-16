'use client';

import { useRef, useState, useTransition } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { CodeFormText, LoginFormText } from './login-text';
import { SessionWatcher } from './session-watcher';

export type LoginErrorReason = 'invalid_email' | 'send_failed' | 'rate_limited';
export type LoginActionResult =
  | { ok: true; email: string }
  | { ok: false; reason: LoginErrorReason };

/**
 * Why a code didn't sign in: no address to check it against (the form lost
 * it, so a new link is needed), too many tries, a code past its time, a code
 * that isn't right (`codeRefusal`), or, said by the form itself, a request
 * that didn't come back.
 */
export type CodeErrorReason = 'no_email' | 'rate_limited' | 'expired' | 'wrong' | 'failed';
export type CodeActionResult = { ok: true; url: string } | { ok: false; reason: CodeErrorReason };

type Props = {
  action: (formData: FormData) => Promise<LoginActionResult>;
  redeem: (formData: FormData) => Promise<CodeActionResult>;
  callbackUrl: string;
  text: LoginFormText;
};

/** What the last request came to: nothing yet, a link sent, or why not. */
type View =
  | { kind: 'idle' }
  | { kind: 'success'; email: string }
  | { kind: 'error'; reason: LoginErrorReason };

/** The view, plus `loading` while a request is out. */
type FormState = 'idle' | 'loading' | 'success' | 'error';

const MIN_LOADING_MS = 500;

export function LoginForm({ action, redeem, callbackUrl, text }: Props) {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();
  // Controlled, because React resets an uncontrolled field once a form action
  // runs, which made someone retype their whole address to fix one typo.
  const [email, setEmail] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const state: FormState = pending ? 'loading' : view.kind;
  const inert = state === 'loading' || state === 'success';
  // Each request is charged to the IP's allowance first, which everyone on a
  // shared network shares, so once rate-limited the button does nothing until
  // the address is edited (which clears the error, below).
  const locked = !pending && view.kind === 'error' && view.reason === 'rate_limited';

  const handleSubmit = (formData: FormData) => {
    // The box is disabled while inert, so formData has no address in it.
    if (inert) return;
    // Text React never saw (typed before the page hydrated, or put back by the
    // browser) is in the box but not in `email`, and the re-render after this
    // submit would write '' over it.
    setEmail(String(formData.get('email') ?? ''));
    if (locked) return;
    startTransition(async () => {
      const start = Date.now();
      let result: LoginActionResult;
      try {
        result = await action(formData);
      } catch {
        result = { ok: false, reason: 'send_failed' };
      }
      const elapsed = Date.now() - start;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      if (result.ok) {
        // Empty, ready for "Send again" with a different address.
        setEmail('');
        setView({ kind: 'success', email: result.email });
      } else {
        setView({ kind: 'error', reason: result.reason });
      }
    });
  };

  const reset = () => {
    setView({ kind: 'idle' });
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const buttonBg =
    state === 'success' ? 'bg-success' : state === 'error' ? 'bg-danger' : 'bg-brand';
  const buttonHover = state === 'idle' ? 'hover:bg-brand-hover' : '';
  const buttonLoading = state === 'loading' ? 'brightness-90' : '';
  const buttonLocked = locked ? 'cursor-not-allowed opacity-60' : '';

  return (
    <>
      <form action={handleSubmit} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{text.email}</span>
          <input
            ref={inputRef}
            type="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // A changed address is a new request: drop the error, and with it
              // the rate-limit lock.
              if (view.kind === 'error') setView({ kind: 'idle' });
            }}
            required
            autoComplete="email"
            inputMode="email"
            disabled={inert}
            className="w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 text-base shadow-sm transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-white disabled:opacity-100"
            placeholder={text.emailPlaceholder}
          />
        </label>
        <button
          type="submit"
          aria-disabled={inert || locked}
          aria-busy={state === 'loading'}
          data-state={state}
          className={`relative w-full rounded-lg px-5 py-3 font-medium text-white transition-colors duration-180 ease-emphasized ${buttonBg} ${buttonHover} ${buttonLoading} ${buttonLocked}`}
        >
          <ButtonLabel state={state} text={text} />
        </button>
        <HelperText state={state} view={view} onReset={reset} text={text} />
      </form>
      {state === 'success' && view.kind === 'success' ? (
        <>
          <CodeForm email={view.email} redeem={redeem} text={text.code} />
          <SessionWatcher callbackUrl={callbackUrl} />
        </>
      ) : null}
    </>
  );
}

/**
 * The way out when the email was opened somewhere else: type the code from
 * it here and this window signs in. Also the way out when the email arrives
 * on the same device but the link is awkward to click (a webview, an OAuth
 * popup with no address bar).
 */
function CodeForm({
  email,
  redeem,
  text,
}: {
  email: string;
  redeem: (formData: FormData) => Promise<CodeActionResult>;
  text: CodeFormText;
}) {
  const [message, setMessage] = useState<string | null>(null);
  // Controlled for the same reason as the email box: left to React's reset, a
  // wrong code vanished and one mistyped digit meant typing all six again.
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const submit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      let result: CodeActionResult;
      try {
        result = await redeem(formData);
      } catch {
        result = { ok: false, reason: 'failed' };
      }
      if (result.ok) {
        // A full navigation, so the sign-in cookie set on the way lands here.
        window.location.assign(result.url);
        return;
      }
      setMessage(text.errors[result.reason]);
    });
  };
  return (
    <form
      action={submit}
      className="space-y-3 rounded-xl border border-surface-sunk bg-surface-raised p-4"
    >
      <input type="hidden" name="email" value={email} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{text.label}</span>
        <span className="mb-2 block text-sm text-ink-muted">{text.hint}</span>
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? 'code-error' : undefined}
          className="w-full rounded-lg border border-surface-sunk bg-white px-4 py-2.5 font-mono text-lg tracking-[0.3em] outline-none focus:border-brand"
          placeholder="123456"
        />
      </label>
      {message ? (
        <p id="code-error" role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-lg border border-surface-sunk bg-white px-5 py-2.5 font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-60"
      >
        {pending ? text.checking : text.submit}
      </button>
    </form>
  );
}

function ButtonLabel({ state, text }: { state: FormState; text: LoginFormText }) {
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center justify-center gap-2">
        <Spinner />
        <span>{text.sending}</span>
      </span>
    );
  }
  if (state === 'success') {
    return (
      <span className="inline-flex items-center justify-center gap-2">
        <CheckIcon />
        <span>{text.sent}</span>
      </span>
    );
  }
  return <span>{text.send}</span>;
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset="24"
        className="animate-check-draw"
      />
    </svg>
  );
}

type HelperProps = {
  state: FormState;
  view: View;
  onReset: () => void;
  text: LoginFormText;
};

function HelperText({ state, view, onReset, text }: HelperProps) {
  return (
    <p
      role={state === 'error' ? 'alert' : undefined}
      aria-live={state === 'error' ? undefined : 'polite'}
      // One colour class at a time: given both, an error rendered in
      // text-ink-soft's grey.
      className={`min-h-[1.2em] text-xs ${state === 'error' ? 'text-danger' : 'text-ink-soft'}`}
    >
      {state === 'success' && view.kind === 'success' && (
        <>
          {text.sentTo.before}
          <strong className="font-medium text-ink">{view.email}</strong>
          {text.sentTo.after}{' '}
          <button
            type="button"
            onClick={onReset}
            className="text-brand underline-offset-2 hover:underline"
          >
            {text.sendAgain}
          </button>
        </>
      )}
      {state === 'error' && view.kind === 'error' && (
        <>
          {text.errors[view.reason]}
          {/* No quick retry once rate-limited: each request is charged to
              the IP first, and on a shared IP that allowance is everyone's. */}
          {view.reason !== 'rate_limited' && (
            <>
              {' '}
              <button
                type="button"
                onClick={onReset}
                className="underline-offset-2 hover:underline"
              >
                {text.tryAgain}
              </button>
            </>
          )}
        </>
      )}
    </p>
  );
}
