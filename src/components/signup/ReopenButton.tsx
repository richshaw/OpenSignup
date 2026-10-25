'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { useAnnouncedStatusChange } from './HeaderAnnouncer';
import { HEADER_BUTTON, PRIMARY } from './header-buttons';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  StatusActionScope,
  useStatusActionPending,
  useStatusActionState,
  type StatusChangeAction,
} from './StatusActionForm';

/**
 * The closed banner's Reopen signup, on every tab. Once it has reopened the
 * signup the banner goes, the header says so and focus moves to the title
 * (`HeaderAnnouncer`); no share panel opens, since the link is the one
 * already shared. A refusal (a viewer's role, a signup reopened or deleted
 * in another tab, no slots left) shows under it, and focus comes back to the
 * button. Viewers see it too, and are told they can't edit, as they are by
 * Publish and Close signup.
 *
 * Blue, as `PRIMARY` is the header's one blue button and a closed signup's
 * header has none; an outlined button would vanish into the banner's grey.
 * On a phone it's as wide and tall as the phone bar's buttons.
 */
export function ReopenButton({ reopenAction }: { reopenAction: StatusChangeAction }) {
  const reopen = useAnnouncedStatusChange(reopenAction, 'open');
  const button = useRef<HTMLButtonElement>(null);
  return (
    <StatusActionScope action={reopen}>
      <StatusActionButtonForm>
        <AsyncSubmitButton
          ref={button}
          loadingLabel="Reopening…"
          className={`${HEADER_BUTTON} ${PRIMARY} max-md:h-12 max-md:w-full max-md:px-4 max-md:text-[15px]`}
        >
          Reopen signup
        </AsyncSubmitButton>
      </StatusActionButtonForm>
      <Refusal button={button} />
    </StatusActionScope>
  );
}

// Hidden while a press is in flight, as Close signup's is, so a retry
// doesn't show the last refusal under "Reopening…". Once a press comes back
// refused, focus goes back to the button: it lost focus while it was
// disabled, and a browser doesn't give it back. Keyed on the refusal, so a
// closed signup's page never takes focus as it loads.
function Refusal({ button }: { button: RefObject<HTMLButtonElement | null> }) {
  const pending = useStatusActionPending();
  const state = useStatusActionState();
  const refused = !pending && state !== null && 'error' in state;
  useEffect(() => {
    if (refused) button.current?.focus();
  }, [refused, state, button]);
  return refused ? <StatusActionRefusal className="mt-2" /> : null;
}
