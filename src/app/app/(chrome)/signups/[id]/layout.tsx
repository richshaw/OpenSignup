import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { countCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';
import { SignupHeader } from '@/components/signup/SignupHeader';
import { TabsNav } from '@/components/signup/TabsNav';
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
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=/app/signups/${id}`);
  const actor = toActor(session);
  const result = await loadSignupForOrganizer(actor, id);
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
  const responsesCount = await countCommitmentsForSignup(getDb(), id);

  return (
    <div className="space-y-6">
      <SignupHeader
        signupId={id}
        title={sig.title}
        description={sig.description ?? null}
        status={sig.status}
        publicUrl={publicSignupUrl(sig.slug)}
        publishAction={publishAction.bind(null, id)}
        closeAction={closeAction.bind(null, id)}
      />
      <TabsNav
        signupId={id}
        counts={{ fields: sig.fields.length, slots: sig.slots.length, responses: responsesCount }}
      />
      <div>{children}</div>
    </div>
  );
}
