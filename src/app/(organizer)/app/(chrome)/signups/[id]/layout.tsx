import { getDb } from '@/db/client';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { loadCommittedBySlotForOrganizer, loadSignupForOrganizer } from '@/services/signups.cached';
import { countActiveCommitmentsForSignup } from '@/services/commitments';
import { publicSignupUrl } from '@/lib/links';
import { shareMessage } from '@/lib/share-message';
import { spotCounts } from '@/lib/spot-counts';
import { BuildBridge } from '@/components/signup/BuildBridge';
import { ClosedNotice } from '@/components/signup/ClosedNotice';
import { HeaderAnnouncer } from '@/components/signup/HeaderAnnouncer';
import { SignupHeader } from '@/components/signup/SignupHeader';
import { signupHeaderText } from '@/components/signup/header-text';
import { hasPhoneBar, PHONE_BAR_ROOM } from '@/components/signup/phone-bar';
import { TabsNav } from '@/components/signup/TabsNav';
import { AiDraftBanner } from '@/components/magic-compose/AiDraftBanner';
import { SignupLoadError, signupNotFoundTitle } from '@/components/signup/SignupLoadError';
import { getServerTranslator } from '@/i18n/server';
import { messagesFor } from '@/i18n/translator';
import { localeOfOrganizer, localeOfSignup } from '@/i18n/locale';
import type { SignupStatus } from '@/schemas/signups';
import { closeAction, closeQuestionAction, publishAction, reopenAction } from './actions';
import { signupTabPath } from '@/lib/organizer-paths';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return { title: 'Signup' };
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return { title: signupNotFoundTitle(localeOfOrganizer(session)) };
  return { title: result.value.title };
}

export default async function SignupDetailLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  // The header's language. It changes only when the organizer saves one in
  // account Settings, a server action whose redirect renders every layout
  // again (#938), so this layout not re-rendering between tabs leaves it right.
  const locale = localeOfOrganizer(session);
  const result = await loadSignupForOrganizer(actor, id);
  if (!result.ok) {
    return (
      <div className="sm:py-8">
        <SignupLoadError error={result.error} email={session.email} locale={locale} />
      </div>
    );
  }
  const sig = result.value;
  // Spots taken, which a draft's header doesn't show. The Build tab reads
  // them through the same cached read.
  const [responsesCount, filled] = await Promise.all([
    countActiveCommitmentsForSignup(getDb(), id),
    sig.status === 'draft' ? null : loadCommittedBySlotForOrganizer(actor, id),
  ]);
  if (filled && !filled.ok) {
    return (
      <div className="sm:py-8">
        <SignupLoadError error={filled.error} email={session.email} locale={locale} />
      </div>
    );
  }
  const publicUrl = publicSignupUrl(sig.slug);
  const status = sig.status as SignupStatus;
  const aiDraft = getServerTranslator(locale, 'organizer.aiDraft');
  const slots = {
    count: sig.slots.length,
    spoken: getServerTranslator(locale, 'organizer.build.sheet')('slotCount', {
      count: sig.slots.length,
    }),
  };
  // The words of the header's client components, the closed box and the
  // tabs, passed to them as props.
  const text = signupHeaderText(getServerTranslator(locale, 'organizer.signup'));
  // The signup's language. Its title is in it, and so is the message the
  // share panel offers to send, which is for participants, as its page is:
  // neither is in the organizer's.
  const contentLocale = localeOfSignup(sig.settings.locale);
  const message = shareMessage(
    sig,
    publicUrl,
    { locale: contentLocale, t: getServerTranslator(contentLocale, 'participant.share') },
    filled?.value,
  );

  return (
    // The header reaches the Build tab through this: Publish saves its edits
    // first, and a check's fix opens a slot there.
    <BuildBridge buildHref={signupTabPath(id, 'build')} slots={slots}>
      {/* On a phone, a draft's Publish and share or an open signup's Share is in
        a bar fixed to the bottom of the screen; the page leaves room for it. */}
      <div className={`space-y-6 ${hasPhoneBar(status) ? PHONE_BAR_ROOM : ''}`}>
        {/* One live region for the computer's header and the phone's, so a
          status change made from either is said in one place, round the
          closed box too, which shows only after this page's own Close
          signup. It adds only that region to the page, after the header and
          the box, so they stay this div's own children and keep its
          spacing. */}
        <HeaderAnnouncer status={status} announcements={text.announcements}>
          <SignupHeader
            locale={locale}
            contentLocale={contentLocale}
            text={text}
            signupId={id}
            title={sig.title}
            status={status}
            publicUrl={publicUrl}
            spots={filled ? spotCounts(sig.slots, filled.value) : null}
            closeQuestionAction={closeQuestionAction.bind(null, id)}
            shareMessage={message}
            publishAction={publishAction.bind(null, id)}
            closeAction={closeAction.bind(null, id)}
            reopenAction={reopenAction.bind(null, id)}
          />
          {/* Once, after Close signup on this page; see ClosedNotice. */}
          <ClosedNotice status={status} text={text.closedNotice} />
        </HeaderAnnouncer>
        <AiDraftBanner
          signupId={id}
          signupStatus={sig.status}
          text={{
            title: aiDraft('title', { fields: sig.fields.length, slots: sig.slots.length }),
            body: aiDraft('body'),
            dismiss: aiDraft('dismiss'),
          }}
          locale={locale}
          // Only a draft shows the banner, so only a draft's pages carry these.
          warningMessages={
            status === 'draft' ? messagesFor(locale, 'organizer.aiDraft.warnings') : null
          }
        />
        <TabsNav signupId={id} counts={{ slots, responses: responsesCount }} labels={text.tabs} />
        <div>{children}</div>
      </div>
    </BuildBridge>
  );
}
