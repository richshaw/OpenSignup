'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';

interface EditFormProps {
  commitmentId: string;
  token: string;
  initialName: string;
  initialNotes: string;
  initialQuantity: number;
  /**
   * The most places this commitment could hold, or `null` on an unlimited
   * slot (see `maxQuantityForCommitment`). At 1 there is nothing to change, so
   * the quantity field is left out; above 1 it is the field's `max`.
   */
  maxQuantity: number | null;
  slug: string;
}

export default function EditForm({
  commitmentId,
  token,
  initialName,
  initialNotes,
  initialQuantity,
  maxQuantity,
  slug,
}: EditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Holding more than the slot now allows can't happen (capacity can't drop
  // below what is taken), but if it did, keep the field so it can be lowered.
  const askQuantity = maxQuantity === null || maxQuantity > 1 || initialQuantity > 1;
  // Never below what is already held, or the form could not be saved at all.
  const spotsMax = maxQuantity === null ? null : Math.max(maxQuantity, initialQuantity);
  const spotsHintId = useId();

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const data = new FormData(e.currentTarget);
    const quantity = data.get('quantity');
    const body = {
      name: String(data.get('name') ?? ''),
      notes: String(data.get('notes') ?? ''),
      // With no quantity field, send none, so saving a name or notes change
      // leaves the quantity exactly as it is.
      ...(quantity === null ? {} : { quantity: Number(quantity) }),
    };
    const res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) {
      setMessage({ kind: 'err', text: payload?.error?.message ?? 'save failed' });
    } else {
      setMessage({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    }
    setSaving(false);
  }

  async function handleConfirmCancel() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      router.push(`/s/${slug}`);
    } else {
      const payload = await res.json().catch(() => null);
      setMessage({ kind: 'err', text: payload?.error?.message ?? 'cancel failed' });
      setConfirmingCancel(false);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Name</span>
        <input
          type="text"
          name="name"
          required
          defaultValue={initialName}
          className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
        />
      </label>
      <div className={askQuantity ? 'grid grid-cols-[1fr_auto] gap-3' : undefined}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Notes</span>
          <input
            type="text"
            name="notes"
            maxLength={500}
            defaultValue={initialNotes}
            className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
          />
        </label>
        {askQuantity ? (
          <div className="w-20">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Spots</span>
              <input
                type="number"
                name="quantity"
                required
                min={1}
                max={spotsMax ?? undefined}
                defaultValue={initialQuantity}
                aria-describedby={spotsMax === null ? undefined : spotsHintId}
                className="focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk px-4 py-3 focus:outline-none focus:ring-1"
              />
            </label>
            {spotsMax === null ? null : (
              <p id={spotsHintId} className="mt-1 text-xs text-ink-muted">
                Up to {spotsMax}
              </p>
            )}
          </div>
        ) : null}
      </div>
      {message ? (
        <p
          role={message.kind === 'ok' ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-sm ${
            message.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {confirmingCancel ? (
          <div
            role="alertdialog"
            aria-label="Confirm cancellation"
            className="flex flex-1 flex-wrap items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm"
          >
            <span className="text-danger font-medium">Cancel this signup?</span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={saving}
                className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={saving}
                className="bg-danger rounded-lg px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
              >
                {saving ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              disabled={saving}
              className="text-danger rounded-lg border border-surface-sunk px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            >
              Cancel signup
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              disabled={saving}
              className="bg-brand rounded-lg px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
