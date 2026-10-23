import { after } from 'next/server';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { getSignupForOrganizer } from '@/services/signups';
import { recordOrganizerView } from '@/lib/view-tracker';
import { SignupLoadError } from '@/components/signup/SignupLoadError';
import SignupView, { toSignupViewProps } from '@/app/s/[slug]/signup-view';

// Plain string so the root template (`%s · <INSTANCE_NAME>`) supplies the
// instance suffix exactly once.
export const metadata = { title: 'Preview' };

type PageParams = { params: Promise<{ id: string }> };

export default async function SignupPreviewPage({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const result = await getSignupForOrganizer(getDb(), actor, id, { includeFilled: true });
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

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView {...toSignupViewProps(sig, sig.committedBySlot)} mode="preview" />
    </main>
  );
}
