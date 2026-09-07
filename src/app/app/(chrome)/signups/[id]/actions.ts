'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { closeSignup, deleteSignup, publishSignup, updateSignup } from '@/services/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { SignupSettingsSchema, type SignupSettings } from '@/schemas/signups';
import { resolveReminderSettings } from '@/lib/reminder-settings';

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

export async function updateReminderAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const reminder = String(formData.get('reminderFromFieldRef') ?? '').trim();

  // Read current settings so we can send the full object.
  // The service replaces settings entirely (not a merge), so we must include
  // all keys — omitting reminderFromFieldRef here is how we clear it.
  const current = await loadSignupForOrganizer(actor, signupId);
  if (!current.ok) {
    redirect(`/app/signups/${signupId}/settings?error=${encodeURIComponent(current.error.message)}`);
  }
  const parsedSettings = SignupSettingsSchema.safeParse(current.value.settings ?? {});
  const prevSettings: Partial<SignupSettings> = parsedSettings.success ? parsedSettings.data : {};
  const { reminderFromFieldRef: _removed, ...restSettings } = prevSettings;

  const leadField = formData.get('reminderLeadHours');
  const { sendReminders, reminderLeadHours } = resolveReminderSettings(
    {
      sendRemindersPresent: formData.get('sendRemindersPresent') !== null,
      sendRemindersChecked: formData.get('sendReminders') !== null,
      leadHoursRaw: leadField === null ? null : String(leadField),
    },
    restSettings,
  );

  const nextSettings = {
    ...restSettings,
    sendReminders,
    reminderLeadHours,
    ...(reminder ? { reminderFromFieldRef: reminder } : {}),
  };

  const result = await updateSignup(getDb(), actor, signupId, { settings: nextSettings });
  if (!result.ok) {
    redirect(`/app/signups/${signupId}/settings?error=${encodeURIComponent(result.error.message)}`);
  }
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
