'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { closeSignup, deleteSignup, publishSignup, updateSignup } from '@/services/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { addSlot, deleteSlot } from '@/services/slots';
import { addField, deleteField } from '@/services/slot-fields';
import { toSlug } from '@/lib/slug';
import type { SlotFieldConfig, SlotFieldDefinition } from '@/schemas/slot-fields';
import { SignupSettingsSchema } from '@/schemas/signups';

function revalidateSignup(id: string) {
  revalidatePath(`/app/signups/${id}`, 'layout');
}

async function requireActor() {
  const s = await getOrganizerSession();
  if (!s) redirect('/login');
  return toActor(s);
}

export async function addFieldAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const label = String(formData.get('label') ?? '').trim();
  const fieldType = String(formData.get('fieldType') ?? 'text') as SlotFieldDefinition['fieldType'];
  const requiredFlag = formData.get('required') !== null;
  const choicesRaw = String(formData.get('choices') ?? '').trim();
  const ref = label ? toSlug(label, { suffix: false }) : '';

  let config: SlotFieldConfig;
  switch (fieldType) {
    case 'text':
      config = { fieldType: 'text', maxLength: 200 };
      break;
    case 'date':
      config = { fieldType: 'date' };
      break;
    case 'time':
      config = { fieldType: 'time' };
      break;
    case 'number':
      config = { fieldType: 'number' };
      break;
    case 'enum': {
      const choices = choicesRaw
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean);
      config = { fieldType: 'enum', choices };
      break;
    }
  }

  await addField(getDb(), actor, signupId, {
    ref,
    label,
    fieldType,
    required: requiredFlag,
    config,
  });
  revalidateSignup(signupId);
}

export async function deleteFieldAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const fieldId = String(formData.get('fieldId') ?? '');
  if (fieldId) await deleteField(getDb(), actor, fieldId);
  revalidateSignup(signupId);
}

export async function updateSettingsAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const groupBy = String(formData.get('groupByFieldRef') ?? '').trim();
  const reminder = String(formData.get('reminderFromFieldRef') ?? '').trim();

  const current = await loadSignupForOrganizer(actor, signupId);
  if (!current.ok) return;
  const parsedSettings = SignupSettingsSchema.safeParse(current.value.settings ?? {});
  const prevSettings = parsedSettings.success
    ? parsedSettings.data
    : ({} as { reminderFromFieldRef?: string });
  const { reminderFromFieldRef: _removed, ...restSettings } = prevSettings;
  const nextSettings = reminder
    ? { ...restSettings, groupByFieldRefs: groupBy ? [groupBy] : [], reminderFromFieldRef: reminder }
    : { ...restSettings, groupByFieldRefs: groupBy ? [groupBy] : [] };

  await updateSignup(getDb(), actor, signupId, { settings: nextSettings });
  revalidateSignup(signupId);
}

export async function addSlotAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const result = await loadSignupForOrganizer(actor, signupId);
  if (!result.ok) return;
  const fields = result.value.fields;

  const capacityRaw = String(formData.get('capacity') ?? '').trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = formData.get(`field:${f.ref}`);
    if (raw === null) continue;
    const str = String(raw).trim();
    if (str === '') continue;
    if (f.fieldType === 'number') {
      const n = Number(str);
      if (!Number.isNaN(n)) values[f.ref] = n;
    } else {
      values[f.ref] = str;
    }
  }
  await addSlot(getDb(), actor, signupId, { values, capacity });
  revalidateSignup(signupId);
}

export async function deleteSlotAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const slotId = String(formData.get('slotId') ?? '');
  if (slotId) await deleteSlot(getDb(), actor, slotId);
  revalidateSignup(signupId);
}

export async function publishAction(signupId: string) {
  const actor = await requireActor();
  await publishSignup(getDb(), actor, signupId);
  revalidateSignup(signupId);
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
  const prevSettings = parsedSettings.success
    ? parsedSettings.data
    : ({} as { reminderFromFieldRef?: string });
  const { reminderFromFieldRef: _removed, ...restSettings } = prevSettings;
  const nextSettings = reminder ? { ...restSettings, reminderFromFieldRef: reminder } : restSettings;

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

export async function updateBasicsAction(signupId: string, formData: FormData) {
  const actor = await requireActor();
  const updated = await updateSignup(getDb(), actor, signupId, {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
  });
  if (!updated.ok) {
    redirect(
      `/app/signups/${signupId}/settings?error=${encodeURIComponent(updated.error.message)}`,
    );
  }
  revalidateSignup(signupId);
}
