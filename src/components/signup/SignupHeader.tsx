import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import { closeSignupQuestion, spotsTakenLine, type SpotCounts } from '@/lib/spot-counts';
import type { SignupStatus } from '@/schemas/signups';
import type { CloseQuestionAction } from './CloseSignupConfirm';
import { DraftLine, PhonePreviewItem, PhoneStanding } from './HeaderParts';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { HEADER_BUTTON, OUTLINED } from './header-buttons';
import { MobileSignupHeader } from './MobileSignupHeader';
import { MoreActionsMenu } from './MoreActionsMenu';
import { PublishButton, PublishRefusal } from './PublishButton';
import { ShareButton } from './ShareButton';
import { ShareScope } from './ShareScope';
import type { StatusAction } from './StatusActionForm';

interface SignupHeaderProps {
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
  /** What the share panel offers to send with the link, from `shareMessage`. */
  shareMessage: string;
  publishAction: StatusAction;
  closeAction: StatusAction;
}

export function SignupHeader({
  signupId,
  title,
  status,
  publicUrl,
  spots,
  closeQuestionAction,
  shareMessage,
  publishAction,
  closeAction,
}: SignupHeaderProps) {
  const previewHref = `/app/signups/${signupId}/preview`;
  const closeQuestion = spots ? closeSignupQuestion(spots) : '';
  const spotsTaken = spots ? spotsTakenLine(spots, status) : null;

  return (
    <HeaderAnnouncer status={status}>
      {/* Publish, from either header, and the share panel it opens. */}
      <ShareScope
        publishAction={publishAction}
        signupId={signupId}
        title={title}
        url={publicUrl}
        message={shareMessage}
      >
      <div className="md:hidden">
        <MobileSignupHeader
          title={title}
          status={status}
          standing={
            <PhoneStanding
              signupId={signupId}
              status={status}
              publicUrl={publicUrl}
              spotsTaken={spotsTaken}
            />
          }
          previewItem={<PhonePreviewItem href={previewHref} />}
          spotsTaken={spotsTaken}
          closeQuestion={closeQuestion}
          closeQuestionAction={closeQuestionAction}
          closeAction={closeAction}
        />
      </div>
      {/* Preview, then Publish and share on a draft, or on an open signup
          Share and the ⋯ that holds Close signup. Publish's refusal shows on
          its own full-width line under the header, not by the buttons; Close
          signup's shows in its panel, which runs it. */}
      <header className="hidden space-y-3 md:block">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-h-[1.875rem] flex-wrap items-center gap-3">
            {/* Focusable, to take focus once Close signup's ⋯ is gone. */}
            <h1
              tabIndex={-1}
              data-signup-title
              className="truncate text-2xl font-semibold tracking-tight"
            >
              {title}
            </h1>
            <StatusPill status={status} />
          </div>
          {status === 'draft' ? (
            <DraftLine />
          ) : (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <PublicLinkChip
                url={publicUrl}
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
            Preview
          </Link>
          {status === 'draft' ? <PublishButton variant="desktop" /> : null}
          {status === 'open' ? (
            <>
              <ShareButton variant="desktop" />
              <MoreActionsMenu
                closeQuestion={closeQuestion}
                closeQuestionAction={closeQuestionAction}
                closeAction={closeAction}
              />
            </>
          ) : null}
        </div>
      </div>
      {status === 'draft' ? <PublishRefusal /> : null}
      </header>
      </ShareScope>
    </HeaderAnnouncer>
  );
}
