'use client';

import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { useAnnouncedStatusChange } from './HeaderAnnouncer';
import { HEADER_BUTTON, PRIMARY } from './header-buttons';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  StatusActionScope,
  useStatusActionPending,
  type StatusAction,
} from './StatusActionForm';

/**
 * The closed banner's Reopen signup, on every tab. Once it has reopened the
 * signup the banner goes, the header says so and focus moves to the title
 * (`HeaderAnnouncer`); no share panel opens, since the link is the one
 * already shared. A refusal (a viewer's role, a signup reopened or deleted
 * in another tab, no slots left) shows under it. Viewers see it too, and are
 * told they can't edit, as they are by Publish and Close signup.
 *
 * Blue, as `PRIMARY` is the one blue button and a closed signup has no other;
 * an outlined button would vanish into the banner's grey. On a phone it's as
 * wide and tall as the phone bar's buttons.
 */
export function ReopenButton({ reopenAction }: { reopenAction: StatusAction }) {
  const reopen = useAnnouncedStatusChange(reopenAction, 'open');
  return (
    <StatusActionScope action={reopen}>
      <StatusActionButtonForm>
        <AsyncSubmitButton
          loadingLabel="Reopening…"
          className={`${HEADER_BUTTON} ${PRIMARY} max-md:h-12 max-md:w-full max-md:px-4 max-md:text-[15px]`}
        >
          Reopen signup
        </AsyncSubmitButton>
      </StatusActionButtonForm>
      <Refusal />
    </StatusActionScope>
  );
}

// Hidden while a press is in flight, as Close signup's is, so a retry
// doesn't show the last refusal under "Reopening…".
function Refusal() {
  const pending = useStatusActionPending();
  return pending ? null : <StatusActionRefusal className="mt-2" />;
}
