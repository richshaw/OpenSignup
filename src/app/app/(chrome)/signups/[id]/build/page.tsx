import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { recordOrganizerView } from '@/lib/view-tracker';
import { BuildGrid } from '@/components/build-grid';
import { BuildWysiwyg } from '@/components/build-wysiwyg/BuildWysiwyg';
import { AiDraftBanner } from '@/components/magic-compose/AiDraftBanner';
import { PublishedBanner } from '@/components/signup/PublishedBanner';
import { SignupSettingsSchema, type SignupStatus } from '@/schemas/signups';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BuildTab({ params, searchParams }: PageParams) {
  const { id } = await params;
  const sp = await searchParams;
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
  // Dev-only toggle while B/3 is in flight; removed at the PR 8a cutover.
  const useWysiwyg = sp['wysiwyg'] === '1';
  const meta = {
    title: sig.title,
    description: sig.description,
    status: sig.status as SignupStatus,
    slug: sig.slug,
  };
  const slots = sig.slots.map((s) => ({
    id: s.id,
    capacity: s.capacity ?? null,
    sortOrder: s.sortOrder,
    values: (s.values ?? {}) as Record<string, unknown>,
  }));
  const settings = SignupSettingsSchema.parse(sig.settings ?? {});
  return (
    <>
      <PublishedBanner signupStatus={sig.status} />
      <AiDraftBanner
        signupId={sig.id}
        signupStatus={sig.status}
        fieldsCount={sig.fields.length}
        slotsCount={sig.slots.length}
      />
      {useWysiwyg ? (
        <BuildWysiwyg
          signupId={id}
          signupMeta={meta}
          initialFields={sig.fields}
          initialSlots={slots}
          initialSettings={settings}
        />
      ) : (
        <BuildGrid
          signupId={id}
          signupMeta={meta}
          initialFields={sig.fields}
          initialSlots={slots}
          initialSettings={settings}
        />
      )}
    </>
  );
}
