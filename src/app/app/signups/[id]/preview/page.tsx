import Link from 'next/link';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import type { SignupStatus } from '@/schemas/signups';
import { getSignupForOrganizer } from '@/services/signups';
import { recordOrganizerView } from '@/lib/view-tracker';
import SignupView, {
  toSignupViewFields,
  toSignupViewSlots,
} from '@/app/s/[slug]/signup-view';

// Plain string so the root template (`%s · <INSTANCE_NAME>`) supplies the
// instance suffix exactly once.
export const metadata = { title: 'Preview' };

type PageParams = { params: Promise<{ id: string }> };

export default async function SignupPreviewPage({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}/preview`);
  const actor = toActor(session);
  const result = await getSignupForOrganizer(getDb(), actor, id);
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <p className="text-danger font-medium">{result.error.message}</p>
        <Link href="/app" className="text-brand text-sm underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  const sig = result.value;

  after(() =>
    recordOrganizerView({
      actor: { actorId: session.organizerId, actorType: 'organizer' },
      signupId: sig.id,
      workspaceId: sig.workspaceId,
      eventType: 'signup.previewed',
    }),
  );

  const slots = toSignupViewSlots(sig.slots);
  const fields = toSignupViewFields(sig.fields);
  const settings = (sig.settings ?? {}) as { groupByFieldRefs?: string[] };
  const groupByRef = settings.groupByFieldRefs?.[0] ?? null;

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView
        signup={{
          title: sig.title,
          description: sig.description,
          status: sig.status as SignupStatus,
        }}
        fields={fields}
        groupByRef={groupByRef}
        slots={slots}
        slug={sig.slug}
        mode="preview"
      />
    </main>
  );
}
