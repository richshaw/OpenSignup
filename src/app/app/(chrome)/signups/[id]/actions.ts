'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { ServiceException } from '@/lib/errors';
import { removeCommitment } from '@/services/commitments';
import { closeSignup, deleteSignup, publishSignup } from '@/services/signups';

function revalidateSignup(id: string) {
  revalidatePath(`/app/signups/${id}`, 'layout');
}

async function requireActor() {
  return toActor(await requireOrganizerSession());
}

export async function publishAction(signupId: string) {
  const actor = await requireActor();
  const result = await publishSignup(getDb(), actor, signupId);
  revalidateSignup(signupId);
  if (result.ok) {
    redirect(`/app/signups/${signupId}/build?published=1`);
  }
}

export async function closeAction(signupId: string) {
  const actor = await requireActor();
  await closeSignup(getDb(), actor, signupId);
  revalidateSignup(signupId);
}

/**
 * The Responses tab's Remove. Once the person is off the slot, revalidates the
 * signup's pages, so the row re-renders as cancelled, and returns null. A
 * refusal (a viewer's role, a signup deleted meanwhile) returns its message
 * and revalidates nothing: the page stays as it is, so the confirmation stays
 * open to show it. After a delete, a revalidate would swap the page for
 * "signup not found" and the message would never be seen.
 */
export async function removeCommitmentAction(
  signupId: string,
  commitmentId: string,
): Promise<{ error: string } | null> {
  const actor = await requireActor();
  let result: Awaited<ReturnType<typeof removeCommitment>>;
  try {
    result = await removeCommitment(getDb(), actor, commitmentId);
  } catch (e) {
    // The policy guard throws rather than returning.
    if (e instanceof ServiceException) return { error: e.serviceError.message };
    throw e;
  }
  if (!result.ok) return { error: result.error.message };
  // The public page and the edit link are dynamic, so they read the change on
  // their next request.
  revalidateSignup(signupId);
  return null;
}

export async function deleteSignupAction(signupId: string) {
  const actor = await requireActor();
  const result = await deleteSignup(getDb(), actor, signupId);
  if (!result.ok) {
    redirect(
      `/app/signups/${signupId}/settings?error=${encodeURIComponent(result.error.message)}`,
    );
  }
  // Bust any open tab on the deleted signup so the next interaction shows the
  // organizer "signup not found" state instead of a stale cached layout.
  revalidatePath(`/app/signups/${signupId}`, 'layout');
  revalidatePath('/app');
  redirect('/app');
}
