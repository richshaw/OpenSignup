'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { wasCancelled } from '../../cancelled-message';
import { errorCopyText, participantErrorCopy } from '../../participant-error';
import { Field, NotesAndSpots } from '../../participant-fields';

// The request never reached the server (offline, or a dropped connection).
const SAVE_UNREACHABLE = "Couldn't reach the server, so your changes weren't saved. Check your connection and try again.";
const CANCEL_UNREACHABLE = "Couldn't reach the server, so your spot wasn't cancelled. Check your connection and try again.";
// A refusal whose answer isn't ours to read, such as an error page from a proxy.
const SAVE_UNREADABLE = "Something went wrong, so your changes weren't saved. Try again.";

interface EditFormProps {
  commitmentId: string;
  token: string;
  initialName: string;
  initialNotes: string;
  initialQuantity: number;
  /**
   * The most places this commitment could hold, or `null` on an unlimited
   * slot (see `editLimitsForCommitment`). At 1 there is nothing to change, so
   * the quantity field is left out; above 1 it is the field's `max`.
   */
  maxQuantity: number | null;
}

export default function EditForm({
  commitmentId,
  token,
  initialName,
  initialNotes,
  initialQuantity,
  maxQuantity,
}: EditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Holding more than the slot now allows can't happen (capacity can't drop
  // below what is taken), but if it did, keep the field so it can be lowered.
  const askQuantity = maxQuantity === null || maxQuantity > 1 || initialQuantity > 1;
  // After a capacity error, the server's limit is newer than the page's. Kept
  // here rather than re-read with router.refresh(), which would re-run the
  // page and log another edit-link visit for what was only a failed save.
  const [reportedMax, setReportedMax] = useState<number | null>(null);
  const currentMax = reportedMax ?? maxQuantity;
  // Never below what is already held, or the form could not be saved at all.
  const spotsMax = currentMax === null ? null : Math.max(currentMax, initialQuantity);
  // Said once at the top of the form, as the sign-up sheet says it in its
  // header, rather than on a row of its own under the narrow Spots field.
  const showSpotsMax = askQuantity && spotsMax !== null;
  const spotsMaxId = useId();

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
    let res: Response;
    try {
      res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      setMessage({ kind: 'err', text: SAVE_UNREACHABLE });
      setSaving(false);
      return;
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok && payload === null) {
      setMessage({ kind: 'err', text: SAVE_UNREADABLE });
    } else if (!res.ok) {
      // Cancelled, or moved to another slot, since this page loaded, most
      // likely in another tab. Every save would be refused, so reload: the
      // page then says which in place of this form. `saving` stays on, so
      // nothing here can be pressed again meanwhile.
      if (wasCancelled(payload?.error)) {
        router.refresh();
        return;
      }
      // `remaining` here is the most this commitment can hold, not the spots
      // still free, so the copy is the edit page's own.
      const copy = participantErrorCopy(payload?.error, 'change');
      setMessage({
        kind: 'err',
        text: copy ? errorCopyText(copy) : (payload?.error?.message ?? 'save failed'),
      });
      // Someone else took spots since this page loaded, so the line at the
      // top and the field's max take the error's number.
      const remaining = payload?.error?.details?.remaining;
      if (payload?.error?.code === 'capacity_full' && typeof remaining === 'number') {
        setReportedMax(remaining);
      }
    } else {
      setMessage({ kind: 'ok', text: 'Saved.' });
      // The refresh brings a fresh maxQuantity, but this form stays mounted,
      // so an older error's number would otherwise keep overriding it.
      setReportedMax(null);
      router.refresh();
    }
    setSaving(false);
  }

  async function handleConfirmCancel() {
    setSaving(true);
    setMessage(null);
    let res: Response;
    try {
      res = await fetch(`/api/commitments/${commitmentId}?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
      });
    } catch {
      setMessage({ kind: 'err', text: CANCEL_UNREACHABLE });
      setConfirmingCancel(false);
      setSaving(false);
      return;
    }
    if (res.ok) {
      // Reload rather than go back to the sheet, whose banner may name another
      // sign-up this browser holds: the page then says the spot was cancelled
      // and links back. `saving` stays on until it does.
      router.refresh();
      return;
    }
    const payload = await res.json().catch(() => null);
    const copy = participantErrorCopy(payload?.error, 'change');
    setMessage({
      kind: 'err',
      text: copy ? errorCopyText(copy) : (payload?.error?.message ?? 'cancel failed'),
    });
    setConfirmingCancel(false);
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-xl border border-surface-sunk bg-white p-6">
      {showSpotsMax ? (
        <p id={spotsMaxId} className="text-sm text-ink-muted">
          You can have up to {spotsMax} spots on this slot.
        </p>
      ) : null}
      <Field label="Your name" type="text" name="name" required defaultValue={initialName} />
      <NotesAndSpots
        notes={{ defaultValue: initialNotes }}
        spots={
          askQuantity
            ? {
                max: spotsMax ?? undefined,
                defaultValue: initialQuantity,
                describedBy: showSpotsMax ? spotsMaxId : undefined,
              }
            : undefined
        }
      />
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
