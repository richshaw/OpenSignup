import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
import { SIGNUP_NOT_FOUND_TITLE, SignupLoadError } from '@/components/signup/SignupLoadError';
import SignupView, { toSignupViewProps } from '@/app/s/[slug]/signup-view';

type PageParams = { params: Promise<{ id: string }> };

// Plain strings so the root template (`%s · <INSTANCE_NAME>`) supplies the
// instance suffix exactly once. The read is the page's own, deduped by cache().
export async function generateMetadata({ params }: PageParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return { title: 'Preview' };
  const result = await loadSignupForOrganizer(toActor(session), id);
  return { title: result.ok ? 'Preview' : SIGNUP_NOT_FOUND_TITLE };
}

/** The error card on its own page: preview has no organizer header around it. */
function PreviewLoadError(props: Parameters<typeof SignupLoadError>[0]) {
  return (
    <main className="flex min-h-[100svh] flex-col justify-center px-4 py-12 sm:px-6">
      <SignupLoadError {...props} />
    </main>
  );
}

export default async function SignupPreviewPage({ params }: PageParams) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const result = await loadSignupForOrganizer(actor, id);
  if (!result.ok) {
    return <PreviewLoadError error={result.error} email={session.email} />;
  }
  const sig = result.value;
  const filled = await loadCommittedBySlotForOrganizer(actor, id);
  if (!filled.ok) {
    return <PreviewLoadError error={filled.error} email={session.email} />;
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
