'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { ServiceException } from '@/lib/errors';
import { closeSignup, deleteSignup, publishSignup, updateSignup } from '@/services/signups';

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
 * The Settings tab's "Ask for an email address". Sends only `requireEmail`,
 * which `updateSignup` merges over the stored settings. Anything but Optional
 * saves Required, the default.
 */
export async function setRequireEmailAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const requireEmail = formData.get('requireEmail') !== 'optional';
  const settingsPath = `/app/signups/${signupId}/settings`;
  let refused: string | null = null;
  try {
    const result = await updateSignup(getDb(), actor, signupId, { settings: { requireEmail } });
    if (!result.ok) refused = result.error.message;
  } catch (e) {
    // The policy guard throws rather than returning: a viewer's role.
    if (!(e instanceof ServiceException)) throw e;
    refused = e.serviceError.message;
  }
  if (refused) redirect(`${settingsPath}?error=${encodeURIComponent(refused)}`);
  // This tab re-renders with the saved choice. The public page is dynamic, so
  // its form reads the change on its next request.
  revalidateSignup(signupId);
  redirect(`${settingsPath}?saved=1`);
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
