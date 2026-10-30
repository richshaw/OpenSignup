import { requireOrganizerSession, toActor } from '@/auth/session';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
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
  const result = await loadSignupForOrganizer(actor, id);
  if (!result.ok) {
    return <SignupLoadError message={result.error.message} />;
  }
  const sig = result.value;
  const filled = await loadCommittedBySlotForOrganizer(actor, id);
  if (!filled.ok) {
    return <SignupLoadError message={filled.error.message} />;
  }

  await trackOrganizerView({
    actor: { actorId: session.organizerId, actorType: 'organizer' },
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    eventType: 'signup.previewed',
  });

  return (
    <main className="flex min-h-[100svh] flex-col py-8">
      <SignupView {...toSignupViewProps(sig, filled.value)} mode="preview" />
    </main>
  );
}
