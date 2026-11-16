'use client';

import { useState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { deleteSignupAction } from '../actions';

interface Props {
  signupId: string;
  /**
   * Its words, in the organizer's language, from the Settings tab
   * (`organizer.signupSettings.delete`), so the page sends no messages to the
   * browser.
   */
  text: {
    /** The button that asks first. */
    start: string;
    /** The question's accessible name. */
    label: string;
    question: string;
    confirm: string;
    /** The confirm button while it deletes. */
    deleting: string;
    cancel: string;
  };
}

export function DeleteSignupForm({ signupId, text }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    // A full-strength outline: the faint one it had read as a label on the
    // card's pink, not as a button.
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-danger bg-white px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
      >
        {text.start}
      </button>
    );
  }

  return (
    <form
      action={deleteSignupAction.bind(null, signupId)}
      role="alertdialog"
      aria-label={text.label}
      className="space-y-3"
    >
      <p className="text-sm font-medium text-danger">{text.question}</p>
      <div className="flex flex-wrap gap-2">
        <AsyncSubmitButton
          loadingLabel={text.deleting}
          className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {text.confirm}
        </AsyncSubmitButton>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-surface-sunk bg-white px-4 py-2 text-sm font-medium transition hover:bg-surface-sunk/30"
        >
          {text.cancel}
        </button>
      </div>
    </form>
  );
}
