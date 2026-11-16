import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { shareText } from '@/components/share/share-text';
import { StatusPill } from '@/components/status-pill';
import { langWhereDifferent, type CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { closeSignupQuestion, spotsTakenLine, type SpotCounts } from '@/lib/spot-counts';
import type { SignupStatus } from '@/schemas/signups';
import type { CloseQuestionAction } from './CloseSignupConfirm';
import { DraftLine, PhonePreviewItem, PhoneStanding } from './HeaderParts';
import type { SignupHeaderText } from './header-text';
import { HEADER_BUTTON, OUTLINED } from './header-buttons';
import { MobileSignupHeader } from './MobileSignupHeader';
import { MoreActionsMenu } from './MoreActionsMenu';
import { PublishButton, PublishRefusal } from './PublishButton';
import { ReopenButton, ReopenRefusal, ReopenScope } from './ReopenButton';
import { ShareButton } from './ShareButton';
import { ShareScope } from './ShareScope';
import { signupStatusLabel } from './status-label';
import type { StatusAction, StatusChangeAction } from './StatusActionForm';

interface SignupHeaderProps {
  /** The organizer's language, which all of the header's own text is in. */
  locale: CatalogLocale;
  /**
   * The signup's language (`signupLocale`), which its own words are in: its
   * title, and the message the share panel offers to send. Marked as such
   * where it isn't `locale`.
   */
  contentLocale: CatalogLocale;
  /** Its client components' words, from `signupHeaderText` in `locale`. */
  text: SignupHeaderText;
  signupId: string;
  title: string;
  status: SignupStatus;
  publicUrl: string;
  /**
   * Spots taken, in all and still open: the count by the public link, and
   * what Close signup asks. Null for a draft, which shows neither.
   */
  spots: SpotCounts | null;
  /** Asks the question again from the spots taken now, when ⋯ opens. */
  closeQuestionAction: CloseQuestionAction;
  /**
   * What the share panel offers to send with the link, from `shareMessage`,
   * in the signup's language, which participants read. The panel's own words
   * are in `locale`, the organizer's.
   */
  shareMessage: string;
  publishAction: StatusAction;
  closeAction: StatusChangeAction;
  reopenAction: StatusChangeAction;
}

export function SignupHeader({
  locale,
  contentLocale,
  text,
  signupId,
  title,
  status,
  publicUrl,
  spots,
  closeQuestionAction,
  shareMessage,
  publishAction,
  closeAction,
  reopenAction,
}: SignupHeaderProps) {
  const t = getServerTranslator(locale, 'organizer.signup');
  // The `lang` of the signup's own words, inside the header's.
  const contentLang = langWhereDifferent(contentLocale, locale);
  const previewHref = `/app/signups/${signupId}/preview`;
  const closeQuestion = spots
    ? closeSignupQuestion(spots, getServerTranslator(locale, 'organizer.signup.close'))
    : '';
  const spotsTaken = spots
    ? spotsTakenLine(spots, status, getServerTranslator(locale, 'organizer.signup.spots'))
    : null;
  // The Share buttons', the panel's and the public link's words.
  const share = shareText(getServerTranslator(locale, 'organizer.share'), title);
  // Rendered here for both headers: the phone's takes it as a node, so it
  // stays out of the page's JavaScript.
  const pill = (
    <StatusPill
      status={status}
      label={signupStatusLabel(status, getServerTranslator(locale, 'organizer.status'))}
    />
  );

  return (
    // Publish, from either header, and the share panel it opens. Their live
    // region is the layout's HeaderAnnouncer, round this and the closed banner.
    <ShareScope
      publishAction={publishAction}
      signupId={signupId}
      title={title}
      url={publicUrl}
      message={shareMessage}
      messageLang={contentLang}
      text={share}
    >
      <div className="md:hidden">
        <MobileSignupHeader
          title={title}
          titleLang={contentLang}
          status={status}
          pill={pill}
          standing={
            <PhoneStanding
              signupId={signupId}
              status={status}
              publicUrl={publicUrl}
              chip={share.panel.chip}
              spotsTaken={spotsTaken}
              draftLine={t('draftLine')}
            />
          }
          previewItem={<PhonePreviewItem href={previewHref} label={t('preview')} />}
          text={text}
          spotsTaken={spotsTaken}
          closeQuestion={closeQuestion}
          closeQuestionAction={closeQuestionAction}
          closeAction={closeAction}
          reopenAction={reopenAction}
        />
      </div>
      {/* Preview, then Publish and share on a draft, on an open signup
          Share and the ⋯ that holds Close signup, or on a closed one Reopen
          signup. Publish's refusal shows on its own full-width line under
          the header, not by the buttons, and so does Reopen signup's; Close
          signup's shows in its panel, which runs it. */}
      <header className="hidden space-y-3 md:block">
        <ReopenScope reopenAction={reopenAction} active={status === 'closed'}>
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex min-h-[1.875rem] flex-wrap items-center gap-3">
                {/* Focusable, to take focus once Close signup's ⋯ is gone. */}
                <h1
                  tabIndex={-1}
                  data-signup-title
                  lang={contentLang}
                  className="truncate text-2xl font-semibold tracking-tight"
                >
                  {title}
                </h1>
                {pill}
              </div>
              {status === 'draft' ? (
                <DraftLine text={t('draftLine')} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                  <PublicLinkChip
                    url={publicUrl}
                    text={share.panel.chip}
                    signupId={signupId}
                    className="inline-flex max-w-md"
                  />
                  {spotsTaken ? (
                    <span className="text-[13px] text-ink-muted">{spotsTaken}</span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={previewHref}
                target="_blank"
                rel="noreferrer"
                className={`${HEADER_BUTTON} ${OUTLINED}`}
              >
                <Eye size={15} aria-hidden="true" />
                {t('preview')}
              </Link>
              {status === 'draft' ? <PublishButton variant="desktop" text={text.publish} /> : null}
              {status === 'open' ? (
                <>
                  <ShareButton variant="desktop" />
                  <MoreActionsMenu
                    text={text}
                    closeQuestion={closeQuestion}
                    closeQuestionAction={closeQuestionAction}
                    closeAction={closeAction}
                  />
                </>
              ) : null}
              {status === 'closed' ? <ReopenButton text={text.reopen} /> : null}
            </div>
          </div>
          {status === 'draft' ? <PublishRefusal text={text.publish} /> : null}
          {status === 'closed' ? <ReopenRefusal /> : null}
        </ReopenScope>
      </header>
    </ShareScope>
  );
}
