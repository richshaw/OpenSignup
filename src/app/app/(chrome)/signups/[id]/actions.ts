'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { closeSignup, deleteSignup, publishSignup } from '@/services/signups';

function revalidateSignup(id: string) {
  revalidatePath(`/app/signups/${id}`, 'layout');
}

async function requireActor() {
  const s = await getOrganizerSession();
  if (!s) redirect('/login');
  return toActor(s);
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
