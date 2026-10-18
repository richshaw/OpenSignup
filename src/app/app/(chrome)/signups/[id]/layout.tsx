import { getDb } from '@/db/client';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { countActiveCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';
import { SignupHeader } from '@/components/signup/SignupHeader';
import { TabsNav } from '@/components/signup/TabsNav';
import { AiDraftBanner } from '@/components/magic-compose/AiDraftBanner';
import { PublishedBanner } from '@/components/signup/PublishedBanner';
import { SignupLoadError } from '@/components/signup/SignupLoadError';
import type { SignupStatus } from '@/schemas/signups';
import { closeAction, publishAction } from './actions';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return { title: 'OpenSignup' };
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return { title: 'OpenSignup' };
  return { title: result.value.title };
}

export default async function SignupDetailLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const result = await loadSignupForOrganizer(actor, id);
  if (!result.ok) {
    return <SignupLoadError message={result.error.message} />;
  }
  const sig = result.value;
  const responsesCount = await countActiveCommitmentsForSignup(getDb(), id);

  return (
    <div className="space-y-6">
      <SignupHeader
        signupId={id}
        title={sig.title}
        status={sig.status as SignupStatus}
        publicUrl={publicSignupUrl(sig.slug)}
        publishAction={publishAction.bind(null, id)}
        closeAction={closeAction.bind(null, id)}
      />
      <PublishedBanner signupStatus={sig.status} />
      <AiDraftBanner
        signupId={id}
        signupStatus={sig.status}
        fieldsCount={sig.fields.length}
        slotsCount={sig.slots.length}
      />
      <TabsNav
        signupId={id}
        counts={{ build: sig.fields.length + sig.slots.length, responses: responsesCount }}
      />
      <div>{children}</div>
    </div>
  );
}
