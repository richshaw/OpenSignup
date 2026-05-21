import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { recordOrganizerView } from '@/lib/view-tracker';
import { BuildWysiwyg } from '@/components/build-wysiwyg/BuildWysiwyg';
import { AiDraftBanner } from '@/components/magic-compose/AiDraftBanner';
import { PublishedBanner } from '@/components/signup/PublishedBanner';
import { SignupSettingsSchema, type SignupStatus } from '@/schemas/signups';

type PageParams = { params: Promise<{ id: string }> };

export default async function BuildTab({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/build`);
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.viewed',
    }),
  );
  return (
    <>
      <PublishedBanner signupStatus={sig.status} />
      <AiDraftBanner
        signupId={sig.id}
        signupStatus={sig.status}
        fieldsCount={sig.fields.length}
        slotsCount={sig.slots.length}
      />
      <BuildWysiwyg
        signupId={id}
        signupMeta={{
          title: sig.title,
          description: sig.description,
          status: sig.status as SignupStatus,
          slug: sig.slug,
        }}
        initialFields={sig.fields}
        initialSlots={sig.slots.map((s) => ({
          id: s.id,
          capacity: s.capacity ?? null,
          sortOrder: s.sortOrder,
          values: (s.values ?? {}) as Record<string, unknown>,
        }))}
        initialSettings={SignupSettingsSchema.parse(sig.settings ?? {})}
      />
    </>
  );
}
