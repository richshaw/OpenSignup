'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CommitDialogProps {
  slotId: string;
  slotTitle: string;
  slug: string;
}

interface ApiError {
  code: string;
  message: string;
  suggestion?: string;
  details?: { alternatives?: { id: string; title: string }[] };
}

export default function CommitDialog({ slotId, slotTitle, slug }: CommitDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const body = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
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
      setSuccess({ editUrl: payload.data.editUrl });
      router.refresh();
    } catch {
      setError({ code: 'internal', message: 'network error' });
    } finally {
      setSubmitting(false);
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
          if (e.target === e.currentTarget && !submitting) setOpen(false);
        }}
      >
        <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-card sm:rounded-2xl">
          {success ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">You&apos;re in.</h2>
              <p className="text-ink-muted text-sm">
                We&apos;ve saved your spot for <strong className="text-ink">{slotTitle}</strong>.
                Bookmark this link to edit or cancel later:
              </p>
              <a
                href={success.editUrl}
                className="block break-all rounded-lg bg-surface-raised px-3 py-2 text-xs"
              >
                {success.editUrl}
              </a>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSuccess(null);
                }}
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
                  type="text"
                  name="name"
                  required
                  minLength={1}
                  autoComplete="name"
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
                  className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
                />
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
                <div className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
                  <p className="font-medium">{error.message}</p>
                  {error.suggestion ? <p className="text-xs">{error.suggestion}</p> : null}
                  {error.details?.alternatives?.length ? (
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
                  onClick={() => setOpen(false)}
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
