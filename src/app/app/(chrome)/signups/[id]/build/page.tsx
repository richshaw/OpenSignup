import { requireOrganizerSession, toActor } from '@/auth/session';
import { ClientMessages } from '@/i18n/ClientMessages';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { messagesFor } from '@/i18n/translator';
import { localeOfSignup } from '@/i18n/locale';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
import { BuildWysiwyg } from '@/components/build-wysiwyg/BuildWysiwyg';
import { BUILD_TAB_NAMESPACES } from '@/components/build-wysiwyg/client-namespaces';
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
  // The Build tab's own words are the organizer's, in their language, and
  // reach its client components as messages. What it writes into the signup
  // for participants to read, and the order its groups sort in, are the
  // signup's language: decided here and handed down as props, so the browser
  // loads no catalog.
  const organizerLocale = getOrganizerAppLocale(session);
  const locale = localeOfSignup(sig.settings.locale);
  const t = getServerTranslator(locale, 'participant.defaults');
  await trackOrganizerView({
    actor,
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    eventType: 'signup.viewed',
  });
  return (
    <ClientMessages
      locale={organizerLocale}
      messages={messagesFor(organizerLocale, BUILD_TAB_NAMESPACES)}
    >
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
    </ClientMessages>
  );
}
