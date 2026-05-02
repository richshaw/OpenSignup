'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { suggestEmail } from '@/lib/email-suggest';
import { buildIcs } from '@/lib/ics';

interface CommitDialogProps {
  slotId: string;
  slotTitle: string;
  slotAt: string | null;
  signupTitle: string;
  slug: string;
}

interface ApiError {
  code: string;
  message: string;
  suggestion?: string;
  details?: {
    alternatives?: { id: string; title: string }[];
    remaining?: number;
  };
}

interface PrefillState {
  name: string;
  email: string;
}

const PREFILL_KEY = 'opensignup:lastCommit';

function readPrefill(): PrefillState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrefillState>;
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') return null;
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

function writePrefill(value: PrefillState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFILL_KEY, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export default function CommitDialog({
  slotId,
  slotTitle,
  slotAt,
  signupTitle,
  slug,
}: CommitDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<{ commitmentId: string; editUrl: string } | null>(null);
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const stored = readPrefill();
    setPrefill(stored);
    setEmailValue(stored?.email ?? '');
    // autofocus name on open (or email if name already filled)
    queueMicrotask(() => {
      if (stored?.name) {
        const emailEl = document.querySelector<HTMLInputElement>(
          'input[name="email"]:not([disabled])',
        );
        emailEl?.focus();
      } else {
        nameRef.current?.focus();
      }
    });
  }, [open]);

  const emailHint = useMemo(() => suggestEmail(emailValue), [emailValue]);

  function handleAcceptSuggestion() {
    if (emailHint) setEmailValue(emailHint);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const body = {
      name,
      email,
      notes: String(data.get('notes') ?? '') || undefined,
      quantity: Number(data.get('quantity') ?? 1),
    };
    try {
      const res = await fetch(`/api/slots/${slotId}/commitments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? { code: 'internal', message: 'something went wrong' });
        setSubmitting(false);
        return;
      }
      writePrefill({ name, email });
      setSuccess({
        commitmentId: payload.data.commitment.id,
        editUrl: payload.data.editUrl,
      });
      // Don't refresh server state yet — that would re-render the parent and
      // replace this dialog (slot row swaps to "Edit" once cookie is read),
      // dismissing the success view with its calendar/share affordances.
      // Refresh on close instead.
    } catch {
      setError({ code: 'internal', message: 'network error' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    const wasSuccess = success !== null;
    setOpen(false);
    setSuccess(null);
    setError(null);
    setShareCopied(false);
    if (wasSuccess) router.refresh();
  }

  function handleDownloadIcs() {
    if (!slotAt || !success) return;
    const start = new Date(slotAt);
    const ics = buildIcs({
      uid: `${success.commitmentId}@opensignup.org`,
      title: `${signupTitle} — ${slotTitle}`,
      description: `Edit or cancel: ${success.editUrl}`,
      url: success.editUrl,
      start,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-${slotTitle}.ics`.replace(/[^A-Za-z0-9._-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function handleShare() {
    if (!success) return;
    const shareData = {
      title: signupTitle,
      text: `I'm signed up for "${slotTitle}".`,
      url: success.editUrl,
    };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share(shareData);
        return;
      } catch {
        // user cancelled or share failed; fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(success.editUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // last resort: do nothing — link is already on screen
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
      >
        Sign up
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
      >
        Sign up
      </button>
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center"
        onClick={(e) => {
          if (e.target === e.currentTarget && !submitting) handleClose();
        }}
      >
        <div className="w-full max-w-md rounded-t-xl bg-white p-6 shadow-card sm:rounded-xl">
          {success ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">You&apos;re in.</h2>
              <p className="text-ink-muted text-sm">
                We&apos;ve saved your spot for <strong className="text-ink">{slotTitle}</strong>.
                Bookmark this link to edit or cancel later:
              </p>
              <a
                href={success.editUrl}
                className="block break-all rounded-lg bg-surface-raised px-3 py-2 font-mono text-xs"
              >
                {success.editUrl}
              </a>
              <div className="flex flex-wrap gap-2">
                {slotAt ? (
                  <button
                    type="button"
                    onClick={handleDownloadIcs}
                    className="flex-1 rounded-lg border border-surface-sunk px-3 py-2 text-sm font-medium transition hover:bg-surface-raised"
                  >
                    Add to calendar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex-1 rounded-lg border border-surface-sunk px-3 py-2 text-sm font-medium transition hover:bg-surface-raised"
                >
                  {shareCopied ? 'Link copied' : 'Share link'}
                </button>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="bg-brand w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold">Sign up for {slotTitle}</h2>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Your name</span>
                <input
                  ref={nameRef}
                  type="text"
                  name="name"
                  required
                  minLength={1}
                  autoComplete="name"
                  defaultValue={prefill?.name ?? ''}
                  className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
                />
                {emailHint ? (
                  <p className="text-ink-muted mt-1 text-xs">
                    Did you mean{' '}
                    <button
                      type="button"
                      onClick={handleAcceptSuggestion}
                      className="text-brand font-medium underline"
                    >
                      {emailHint}
                    </button>
                    ?
                  </p>
                ) : null}
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Notes (optional)</span>
                  <input
                    type="text"
                    name="notes"
                    maxLength={500}
                    placeholder="Allergies, preferences, etc."
                    className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
                  />
                </label>
                <label className="block w-20">
                  <span className="mb-1 block text-sm font-medium">Qty</span>
                  <input
                    type="number"
                    name="quantity"
                    min={1}
                    defaultValue={1}
                    className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
                  />
                </label>
              </div>
              {error ? (
                <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
                  <p className="font-medium">{error.message}</p>
                  {error.suggestion ? <p className="text-xs">{error.suggestion}</p> : null}
                  {error.details?.alternatives?.length && error.details.remaining === 0 ? (
                    <div className="mt-2 space-y-1 text-xs">
                      <p>Try another slot:</p>
                      <a
                        href={`/s/${slug}`}
                        className="inline-block rounded bg-white px-2 py-1 underline"
                      >
                        See alternatives
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-surface-sunk px-4 py-3 text-sm font-medium transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? 'Signing up…' : 'Confirm'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
