import { after } from 'next/server';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getSignupForOrganizer } from '@/services/signups';
import { recordOrganizerView } from '@/lib/view-tracker';
import { SignupLoadError } from '@/components/signup/SignupLoadError';
import SignupView, {
  toSignupViewFields,
  toSignupViewSignup,
  toSignupViewSlots,
} from '@/app/s/[slug]/signup-view';

// Plain string so the root template (`%s · <INSTANCE_NAME>`) supplies the
// instance suffix exactly once.
export const metadata = { title: 'Preview' };

type PageParams = { params: Promise<{ id: string }> };

export default async function SignupPreviewPage({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const result = await getSignupForOrganizer(getDb(), actor, id);
  if (!result.ok) {
    return <SignupLoadError message={result.error.message} />;
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

  const slots = toSignupViewSlots(sig);
  const fields = toSignupViewFields(sig.fields);
  const settings = (sig.settings ?? {}) as { groupByFieldRefs?: string[] };
  const groupByRef = settings.groupByFieldRefs?.[0] ?? null;

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView
        signup={toSignupViewSignup(sig)}
        fields={fields}
        groupByRef={groupByRef}
        slots={slots}
        slug={sig.slug}
        mode="preview"
      />
    </main>
  );
}
