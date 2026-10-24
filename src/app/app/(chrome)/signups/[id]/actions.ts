'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-notice';
import { refusalAsResult } from '@/lib/errors';
import { requireWorkspaceWrite } from '@/lib/policy';
import {
  checkBeforePublish,
  publishCheckCopy,
  publishCheckTarget,
  type PublishCheckAnswer,
} from '@/lib/publish-check';
import { closeSignupQuestion, spotCounts } from '@/lib/spot-counts';
import { removeCommitment } from '@/services/commitments';
import {
  closeSignup,
  deleteSignup,
  getSignupForOrganizer,
  publishSignup,
  recordPublishCheck,
  updateSignup,
} from '@/services/signups';
import { removeRefusal } from './responses/remove-refusal';
import { statusRefusal } from './status-refusal';

function revalidateSignup(id: string) {
  revalidatePath(`/app/signups/${id}`, 'layout');
}

async function requireActor() {
  return toActor(await requireOrganizerSession());
}

/**
 * The header's Publish and Close signup. A refusal (a viewer's role, a signup
 * already published or closed in another tab) returns what to tell the
 * organizer, shown under the button, and revalidates nothing.
 *
 * Both stay on the tab they were pressed on and re-render the layout. Publish
 * says it published, which is what opens the header's share panel: an answer
 * to this press, not a flag in the URL, so a reload or a shared link never
 * opens it again.
 *
 * Publish first checks a draft as it's stored (the header has saved the Build
 * tab's edits by then): no slots, no fields or every slot empty answers with
 * the check and publishes nothing, and so does a slot still saying "TBD"
 * unless `form` says the organizer chose Publish anyway
 * (`acknowledge=placeholder`). The form can't wave a blocking problem
 * through. The check reads without a lock, so an edit landing between it and
 * the publish (from another tab, or an AI assistant) isn't checked: a narrow
 * race, and what's published is what the page then shows. A viewer is
 * refused before anything is checked. A signup that isn't a draft goes
 * straight to the service, which says it changed since the page loaded. The
 * service doesn't check; the MCP tool and the REST API publish without it.
 */
export async function publishAction(
  signupId: string,
  form?: FormData,
): Promise<{ error: string } | { published: true } | PublishCheckAnswer> {
  const actor = await requireActor();
  const db = getDb();
  const read = await refusalAsResult(async () => {
    const loaded = await getSignupForOrganizer(db, actor, signupId);
    if (loaded.ok) requireWorkspaceWrite(actor, loaded.value.workspaceId);
    return loaded;
  });
  if (!read.ok) return { error: statusRefusal(read.error, 'publish') };
  // Publish anyway past a slot still saying TBD, which signup.published records.
  let anyway = false;
  if (read.value.status === 'draft') {
    const check = checkBeforePublish(read.value);
    anyway = check?.kind === 'placeholder' && form?.get('acknowledge') === 'placeholder';
    if (check && !anyway) {
      // #525's count of refused publishes, now that the service doesn't see these.
      await refusalAsResult(() => recordPublishCheck(db, actor, signupId, check));
      return { check, copy: publishCheckCopy(check), target: publishCheckTarget(check) };
    }
  }
  const result = await refusalAsResult(() =>
    publishSignup(db, actor, signupId, anyway ? { acknowledged: 'placeholder' } : {}),
  );
  if (!result.ok) return { error: statusRefusal(result.error, 'publish') };
  revalidateSignup(signupId);
  return { published: true };
}

export async function closeAction(signupId: string): Promise<{ error: string } | null> {
  const actor = await requireActor();
  const result = await refusalAsResult(() => closeSignup(getDb(), actor, signupId));
  if (!result.ok) return { error: statusRefusal(result.error, 'close') };
  revalidateSignup(signupId);
  return null;
}

/**
 * What Close signup asks, from the spots taken now. The header's counts are
 * from when the page loaded, and switching tabs doesn't reload them, so the
 * ⋯ menu asks for this as it opens. It only reads: nothing is revalidated,
 * so the page isn't rendered again and records no view. A refusal comes back
 * like Close signup's, and the menu keeps the question it has.
 */
export async function closeQuestionAction(
  signupId: string,
): Promise<{ question: string } | { error: string }> {
  const actor = await requireActor();
  const result = await refusalAsResult(() =>
    getSignupForOrganizer(getDb(), actor, signupId, { includeFilled: true }),
  );
  if (!result.ok) return { error: statusRefusal(result.error, 'close') };
  const { slots, committedBySlot } = result.value;
  return { question: closeSignupQuestion(spotCounts(slots, committedBySlot ?? {})) };
}

/**
 * The Settings tab's "Ask for an email address". Sends only `requireEmail`,
 * which `updateSignup` merges over the stored settings. Anything but Optional
 * saves Required, the default. A refusal shows in plain words, by its code.
 */
export async function setRequireEmailAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const requireEmail = formData.get('requireEmail') !== 'optional';
  const settingsPath = `/app/signups/${signupId}/settings`;
  const result = await refusalAsResult(() =>
    updateSignup(getDb(), actor, signupId, { settings: { requireEmail } }),
  );
  if (!result.ok) {
    redirect(`${settingsPath}?error=${encodeURIComponent(SAVE_ERROR_MESSAGE[result.error.code])}`);
  }
  // This tab re-renders with the saved choice. The public page is dynamic, so
  // its form reads the change on its next request.
  revalidateSignup(signupId);
  redirect(`${settingsPath}?saved=1`);
}

/**
 * The Responses tab's Remove. Once the person is off the slot, revalidates the
 * signup's pages, so the row re-renders as removed, and returns null. A
 * refusal (a viewer's role, a signup deleted meanwhile) returns what to tell
 * the organizer, by its code (`removeRefusal`), and revalidates nothing: the
 * page stays as it is, so the confirmation stays open to show it. After a
 * delete, a revalidate would swap the page for "signup not found" and the
 * message would never be seen.
 */
export async function removeCommitmentAction(
  signupId: string,
  commitmentId: string,
): Promise<{ error: string } | null> {
  const actor = await requireActor();
  const result = await refusalAsResult(() => removeCommitment(getDb(), actor, commitmentId));
  if (!result.ok) return { error: removeRefusal(result.error.code) };
  // The public page and the edit link are dynamic, so they read the change on
  // their next request.
  revalidateSignup(signupId);
  return null;
}

export async function deleteSignupAction(signupId: string) {
  const actor = await requireActor();
  const result = await refusalAsResult(() => deleteSignup(getDb(), actor, signupId));
  if (!result.ok) {
    // In plain words by its code, as Save on the same tab is.
    const message = SAVE_ERROR_MESSAGE[result.error.code];
    redirect(`/app/signups/${signupId}/settings?error=${encodeURIComponent(message)}`);
  }
  // Bust any open tab on the deleted signup so the next interaction shows the
  // organizer "signup not found" state instead of a stale cached layout.
  revalidatePath(`/app/signups/${signupId}`, 'layout');
  revalidatePath('/app');
  redirect('/app');
}
