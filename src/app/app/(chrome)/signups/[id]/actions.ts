'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { SAVE_ERROR_MESSAGE } from '@/components/ui/save-notice';
import { refusalAsResult } from '@/lib/errors';
import { removeCommitment } from '@/services/commitments';
import { closeSignup, deleteSignup, publishSignup, updateSignup } from '@/services/signups';
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
 * already published or closed in another tab, no slots yet) returns what to
 * tell the organizer, shown under the button, and revalidates nothing.
 */
export async function publishAction(signupId: string): Promise<{ error: string } | null> {
  const actor = await requireActor();
  const result = await refusalAsResult(() => publishSignup(getDb(), actor, signupId));
  if (!result.ok) return { error: statusRefusal(result.error, 'publish') };
  revalidateSignup(signupId);
  redirect(`/app/signups/${signupId}/build?published=1`);
}

export async function closeAction(signupId: string): Promise<{ error: string } | null> {
  const actor = await requireActor();
  const result = await refusalAsResult(() => closeSignup(getDb(), actor, signupId));
  if (!result.ok) return { error: statusRefusal(result.error, 'close') };
  revalidateSignup(signupId);
  return null;
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
