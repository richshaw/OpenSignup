'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  useStatusActionPending,
} from './StatusActionForm';

interface CloseSignupConfirmProps {
  /** From `closeSignupQuestion`, built on the server. */
  question: string;
  onNotYet: () => void;
  /** The phone sheet's sizes: full-width buttons at least 44px tall. */
  phone?: boolean;
}

/**
 * What Close signup asks before it closes, in place of the item that opened
 * it: the ⋯ panel on a computer, the More actions sheet on a phone. Not yet,
 * the safe choice, has focus when the question appears and again after a
 * refusal, which shows under the buttons. Entering the group reads the
 * question out, since focus lands on a button. Each time it's asked starts
 * clean: a refusal shows only for a Close signup pressed here.
 */
export function CloseSignupConfirm({ question, onNotYet, phone = false }: CloseSignupConfirmProps) {
  const pending = useStatusActionPending();
  const notYet = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (!pending) notYet.current?.focus();
  }, [pending]);

  // Both buttons have a border, so they're the same height.
  const size = phone ? 'min-h-12 w-full text-[15px]' : 'px-3 py-1.5 text-xs';
  return (
    <div role="group" aria-labelledby={questionId} className="space-y-3">
      <p
        id={questionId}
        className={phone ? 'text-[15px] leading-normal' : 'text-sm leading-normal'}
      >
        {question}
      </p>
      <div className={phone ? 'grid grid-cols-2 gap-2' : 'flex justify-end gap-2'}>
        <button
          ref={notYet}
          type="button"
          disabled={pending}
          onClick={onNotYet}
          className={`rounded-lg border border-surface-sunk bg-white font-medium transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-70 ${size}`}
        >
          Not yet
        </button>
        <StatusActionButtonForm>
          <AsyncSubmitButton
            loadingLabel="Closing…"
            onClick={() => setPressed(true)}
            className={`rounded-lg border border-danger bg-danger font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 ${size}`}
          >
            Close signup
          </AsyncSubmitButton>
        </StatusActionButtonForm>
      </div>
      {pressed && !pending ? <StatusActionRefusal /> : null}
    </div>
  );
}
