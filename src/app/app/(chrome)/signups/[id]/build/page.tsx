import { after } from 'next/server';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { recordOrganizerView } from '@/lib/view-tracker';
import { BuildWysiwyg } from '@/components/build-wysiwyg/BuildWysiwyg';
import { SignupSettingsSchema, type SignupStatus } from '@/schemas/signups';

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
          capacity: s.capacity,
          sortOrder: s.sortOrder,
          values: s.values,
        }))}
        initialSettings={SignupSettingsSchema.parse(sig.settings)}
        committedBySlot={filled.value}
      />
    </>
  );
}
