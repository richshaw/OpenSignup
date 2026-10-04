'use client';

import { useState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { removeCommitmentAction } from '../actions';

interface Props {
  signupId: string;
  commitmentId: string;
  /** Who and which slot, as the confirmation names them. */
  name: string;
  slot: string;
  quantity: number;
}

export function RemoveCommitmentForm({ signupId, commitmentId, name, slot, quantity }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-danger/40 bg-white px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/5"
      >
        Remove
      </button>
    );
  }

  async function remove() {
    const result = await removeCommitmentAction(signupId, commitmentId);
    // On success the row re-renders as cancelled, without this form.
    if (result) setError(result.error);
  }

  return (
    <form
      action={remove}
      role="alertdialog"
      aria-label="Confirm removal"
      className="w-64 space-y-3 text-left"
    >
      <p className="text-sm">
        Remove {name} from {slot}?{' '}
        {quantity > 1 ? `Their ${quantity} spots open` : 'Their spot opens'} up for someone else.
        They won&rsquo;t get an email about it.
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {/* Remove, the button that was focused, is gone; focus the safe choice. */}
        <button
          type="button"
          autoFocus
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-surface-sunk/30"
        >
          Keep
        </button>
        <AsyncSubmitButton
          loadingLabel="Removing…"
          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Yes, remove
        </AsyncSubmitButton>
      </div>
    </form>
  );
}
