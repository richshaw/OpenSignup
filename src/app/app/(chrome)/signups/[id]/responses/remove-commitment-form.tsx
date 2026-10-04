'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync, useFormStatus } from 'react-dom';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { FormError } from '@/components/ui/form-error';
import { removeCommitmentAction } from '../actions';

interface Props {
  signupId: string;
  commitmentId: string;
  /** The row's status cell, which takes focus once the person is removed. */
  statusCellId: string;
  /**
   * Remove's accessible name, "Remove Sam Example from Fruit and water", since
   * every row's button reads Remove.
   */
  label: string;
  /**
   * The confirmation's question, which names them and the slot as `label`
   * does. Rendered by the page, so its words add no script here.
   */
  children: ReactNode;
}

export function RemoveCommitmentForm({
  signupId,
  commitmentId,
  statusCellId,
  label,
  children,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  // For the confirmation's description; unique, as the commitment is.
  const questionId = `remove-${commitmentId}`;

  // Keep, or Escape: back to the Remove button that opened the confirmation.
  function keep() {
    flushSync(() => setConfirming(false));
    removeButton.current?.focus();
  }

  if (!confirming) {
    return (
      <button
        ref={removeButton}
        type="button"
        aria-label={label}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        className="rounded-lg border border-danger/40 bg-white px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/5"
      >
        Remove
      </button>
    );
  }

  async function remove() {
    const result = await removeCommitmentAction(signupId, commitmentId);
    if (result) {
      setError(result.error);
      return;
    }
    // The row re-renders as removed, without this form or the Remove
    // button. Its status cell stays, and says what happened.
    document.getElementById(statusCellId)?.focus();
  }

  return (
    <form
      action={remove}
      role="alertdialog"
      aria-label="Confirm removal"
      aria-describedby={questionId}
      className="w-64 space-y-3 text-left"
    >
      <p id={questionId} className="text-sm">
        {children}
      </p>
      {error ? <FormError>{error}</FormError> : null}
      <ConfirmButtons onKeep={keep} />
    </form>
  );
}

/**
 * Keep and Yes, remove, in a component of their own to read the form's
 * pending state. A removal in flight goes through whatever Keep does, so Keep
 * and Escape wait for it, as the participant's Keep waits for their cancel.
 */
function ConfirmButtons({ onKeep }: { onKeep: () => void }) {
  const { pending } = useFormStatus();
  const keepButton = useRef<HTMLButtonElement>(null);
  // Focus the safe choice when the confirmation opens, since Remove, the
  // button that was focused, is gone. Again after a refusal: the button
  // pressed lost focus while it was disabled, and Escape needs it back here.
  // A removal unmounts this along with the form.
  useEffect(() => {
    if (!pending) keepButton.current?.focus();
  }, [pending]);
  return (
    <div
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) onKeep();
      }}
    >
      <button
        ref={keepButton}
        type="button"
        disabled={pending}
        onClick={onKeep}
        className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-surface-sunk/30 disabled:cursor-not-allowed disabled:opacity-70"
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
  );
}
