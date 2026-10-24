import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { closeSignupQuestion, type SpotCounts } from '@/lib/spot-counts';
import type { SignupStatus } from '@/schemas/signups';
import type { CloseQuestionAction } from './CloseSignupConfirm';
import { HeaderAnnouncer } from './HeaderAnnouncer';
import { MobileSignupHeader } from './MobileSignupHeader';
import { MoreActionsMenu } from './MoreActionsMenu';
import { ShareButton } from './ShareButton';
import { ShareScope } from './ShareScope';
import {
  StatusActionButtonForm,
  StatusActionRefusal,
  type StatusAction,
} from './StatusActionForm';

interface SignupHeaderProps {
  signupId: string;
  title: string;
  status: SignupStatus;
  publicUrl: string;
  /** Spots taken, in all and still open, for what Close signup asks. Null for a draft. */
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
  const gridColsClass =
    status === 'draft'
      ? 'grid-cols-2'
      : status === 'open'
        ? 'grid-cols-[1fr_1fr_auto]'
        : 'grid-cols-1';
  const closeQuestion = spots ? closeSignupQuestion(spots) : '';

  return (
    <HeaderAnnouncer status={status}>
      {/* Publish, from either header, and the share panel it opens. */}
      <ShareScope
        publishAction={publishAction}
        title={title}
        url={publicUrl}
        message={shareMessage}
      >
      <div className="md:hidden">
        <MobileSignupHeader
          title={title}
          status={status}
          publicUrl={publicUrl}
          closeQuestion={closeQuestion}
          closeQuestionAction={closeQuestionAction}
          closeAction={closeAction}
        />
      </div>
      {/* Publish, or on an open signup Share and the ⋯ that holds Close
          signup. Publish's refusal shows on its own full-width line under the
          header, not in the button grid; Close signup's shows in its panel,
          which runs it. */}
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
          <PublicLinkChip url={publicUrl} className="inline-flex max-w-md" />
        </div>
        <div className={`grid w-full max-w-full shrink-0 ${gridColsClass} gap-x-2 gap-y-3 sm:w-auto sm:max-w-sm`}>
          <Link
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-surface-raised inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-sunk px-3 py-1.5 text-xs font-medium transition"
          >
            <Eye size={14} aria-hidden="true" />
            Preview
          </Link>
          {status === 'draft' ? (
            <StatusActionButtonForm>
              <AsyncSubmitButton
                loadingLabel="Publishing…"
                className="bg-brand inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:brightness-90"
              >
                Publish
              </AsyncSubmitButton>
            </StatusActionButtonForm>
          ) : null}
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
      {status === 'draft' ? <StatusActionRefusal /> : null}
      </header>
      </ShareScope>
    </HeaderAnnouncer>
  );
}
