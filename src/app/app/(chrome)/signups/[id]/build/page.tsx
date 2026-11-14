import { requireOrganizerSession, toActor } from '@/auth/session';
import { signupLocale } from '@/i18n/config';
import { getServerTranslator, instanceDefaultLocale } from '@/i18n/server';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
import { BuildWysiwyg } from '@/components/build-wysiwyg/BuildWysiwyg';
import { SignupSettingsSchema } from '@/schemas/signups';

type PageParams = { params: Promise<{ id: string }> };

export default async function BuildTab({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const result = await loadSignupForOrganizer(actor, id);
  if (!result.ok) return null;
  const filled = await loadCommittedBySlotForOrganizer(actor, id);
  if (!filled.ok) return null;
  const sig = result.value;
  // The Build tab's text is the organizer's, in English for now, but what it
  // writes into the signup for participants to read is in the signup's
  // language: decided here and handed down as props, so the browser loads no
  // catalog.
  const locale = signupLocale(sig.settings.locale, instanceDefaultLocale());
  const t = getServerTranslator(locale, 'participant.defaults');
  await trackOrganizerView({
    actor,
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    eventType: 'signup.viewed',
  });
  return (
    <>
      <BuildWysiwyg
        signupId={id}
        signupMeta={{
          title: sig.title,
          description: sig.description,
        }}
        initialFields={sig.fields}
        initialSlots={sig.slots.map((s) => ({
          id: s.id,
          capacity: s.capacity,
          sortOrder: s.sortOrder,
          values: s.values,
        }))}
        initialSettings={SignupSettingsSchema.parse(sig.settings)}
        committedBySlot={filled.value}
        locale={locale}
        fieldDefaults={{ name: t('untitledField'), firstChoice: t('firstChoice') }}
      />
    </>
  );
}
