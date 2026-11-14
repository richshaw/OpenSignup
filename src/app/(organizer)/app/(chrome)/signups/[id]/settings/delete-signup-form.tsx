'use client';

import { useState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { deleteSignupAction } from '../actions';

interface Props {
  signupId: string;
}

export function DeleteSignupForm({ signupId }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-danger/40 bg-white px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5"
      >
        Delete signup
      </button>
    );
  }

  return (
    <form
      action={deleteSignupAction.bind(null, signupId)}
      role="alertdialog"
      aria-label="Confirm signup deletion"
      className="space-y-3"
    >
      <p className="text-sm font-medium text-danger">This will delete the signup.</p>
      <div className="flex flex-wrap gap-2">
        <AsyncSubmitButton
          loadingLabel="Deleting…"
          className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Yes, delete signup
        </AsyncSubmitButton>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-surface-sunk bg-white px-4 py-2 text-sm font-medium transition hover:bg-surface-sunk/30"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
