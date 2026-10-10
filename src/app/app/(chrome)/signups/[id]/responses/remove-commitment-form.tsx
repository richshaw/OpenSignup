'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFormStatus } from 'react-dom';
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

/**
 * Remove, and the confirmation it opens in a modal dialog. The dialog sits
 * above the table, so the table keeps its size, and the rest of the page
 * can't be used until it closes. The browser closes it on Escape and puts
 * focus back on Remove.
 */
export function RemoveCommitmentForm({
  signupId,
  commitmentId,
  statusCellId,
  label,
  children,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  async function remove() {
    const result = await removeCommitmentAction(signupId, commitmentId);
    if (result) {
      setError(result.error);
      return;
    }
    // Closed first, since the page outside an open dialog can't take focus.
    // The row re-renders as removed, without Remove or this dialog. Its
    // status cell stays, and says what happened.
    dialog.current?.close();
    document.getElementById(statusCellId)?.focus();
  }

  // The form holds the dialog, so the dialog can tell when a removal is in
  // flight.
  return (
    <form action={remove}>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
        className="rounded-lg border border-danger/40 bg-white px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/5 max-sm:min-h-11"
      >
        Remove
      </button>
      <ConfirmDialog dialog={dialog} questionId={`remove-${commitmentId}`} error={error}>
        {children}
      </ConfirmDialog>
    </form>
  );
}

/**
 * The dialog, in a component of its own to read the form's pending state. A
 * removal in flight goes through whatever Keep does, so Keep and Escape wait
 * for it, as the participant's Keep waits for their cancel.
 */
function ConfirmDialog({
  dialog,
  questionId,
  error,
  children,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  questionId: string;
  error: string | null;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  const keepButton = useRef<HTMLButtonElement>(null);
  // Opening the dialog focuses Keep, its first button and the safe choice.
  // After a refusal Keep needs focus back: the button pressed lost it while
  // it was disabled. While the dialog is closed, this does nothing.
  useEffect(() => {
    if (!pending) keepButton.current?.focus();
  }, [pending]);
  return (
    // The cell's text-right and the table's nowrap would carry in, so the
    // dialog sets its own.
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-label="Confirm removal"
      aria-describedby={questionId}
      onCancel={(e) => {
        if (pending) e.preventDefault();
      }}
      className="w-[calc(100%-2rem)] max-w-sm space-y-3 whitespace-normal rounded-xl border border-surface-sunk bg-white p-6 text-left text-sm text-ink shadow-card backdrop:bg-ink/35"
    >
      <p id={questionId}>{children}</p>
      {error ? <FormError>{error}</FormError> : null}
      <div className="flex flex-wrap gap-2">
        <button
          ref={keepButton}
          type="button"
          disabled={pending}
          onClick={() => dialog.current?.close()}
          className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-surface-sunk/30 disabled:cursor-not-allowed disabled:opacity-70 max-sm:min-h-11"
        >
          Keep
        </button>
        <AsyncSubmitButton
          loadingLabel="Removing…"
          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 max-sm:min-h-11"
        >
          Yes, remove
        </AsyncSubmitButton>
      </div>
    </dialog>
  );
}
