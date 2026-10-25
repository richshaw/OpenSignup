import { getDb } from '@/db/client';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { countActiveCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';
import { shareMessage } from '@/lib/share-message';
import { KEEPS_THEIR_SPOT, spotCounts } from '@/lib/spot-counts';
import { BuildBridge } from '@/components/signup/BuildBridge';
import { ClosedNotice } from '@/components/signup/ClosedNotice';
import { HeaderAnnouncer } from '@/components/signup/HeaderAnnouncer';
import { SignupHeader } from '@/components/signup/SignupHeader';
import { hasPhoneBar, PHONE_BAR_ROOM } from '@/components/signup/phone-bar';
import { TabsNav } from '@/components/signup/TabsNav';
import { AiDraftBanner } from '@/components/magic-compose/AiDraftBanner';
import { SignupLoadError } from '@/components/signup/SignupLoadError';
import type { SignupStatus } from '@/schemas/signups';
import { closeAction, closeQuestionAction, publishAction, reopenAction } from './actions';

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
  // Spots taken, which a draft's header doesn't show. The Build tab reads
  // them through the same cached read.
  const [responsesCount, filled] = await Promise.all([
    countActiveCommitmentsForSignup(getDb(), id),
    sig.status === 'draft' ? null : loadCommittedBySlotForOrganizer(actor, id),
  ]);
  if (filled && !filled.ok) {
    return <SignupLoadError message={filled.error.message} />;
  }
  const publicUrl = publicSignupUrl(sig.slug);
  const status = sig.status as SignupStatus;

  return (
    // The header reaches the Build tab through this: Publish saves its edits
    // first, and a check's fix opens a slot there.
    <BuildBridge buildHref={`/app/signups/${id}/build`}>
      {/* On a phone, a draft's Publish and share or an open signup's Share is in
        a bar fixed to the bottom of the screen; the page leaves room for it. */}
      <div className={`space-y-6 ${hasPhoneBar(status) ? PHONE_BAR_ROOM : ''}`}>
        {/* One live region for the computer's header and the phone's, so a
          status change made from either is said in one place, round the
          closed box too, which shows only after this page's own Close
          signup. It adds only that region to the page, after the header and
          the box, so they stay this div's own children and keep its
          spacing. */}
        <HeaderAnnouncer status={status}>
          <SignupHeader
            signupId={id}
            title={sig.title}
            status={status}
            publicUrl={publicUrl}
            spots={filled ? spotCounts(sig.slots, filled.value) : null}
            closeQuestionAction={closeQuestionAction.bind(null, id)}
            shareMessage={shareMessage(sig, publicUrl, filled?.value)}
            publishAction={publishAction.bind(null, id)}
            closeAction={closeAction.bind(null, id)}
            reopenAction={reopenAction.bind(null, id)}
          />
          {/* Once, after Close signup on this page; see ClosedNotice. */}
          <ClosedNotice status={status} body={`People can’t sign up now. ${KEEPS_THEIR_SPOT}`} />
        </HeaderAnnouncer>
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
    </BuildBridge>
  );
}
