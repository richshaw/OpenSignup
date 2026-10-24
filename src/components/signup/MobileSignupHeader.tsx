'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import { useCloseQuestion, type CloseQuestionAction } from './CloseSignupConfirm';
import type { StatusAction } from './StatusActionForm';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';
import { ShareButton } from './ShareButton';

interface MobileSignupHeaderProps {
  title: string;
  status: SignupStatus;
  publicUrl: string;
  closeQuestion: string;
  closeQuestionAction: CloseQuestionAction;
  closeAction: StatusAction;
}

/** The phone's header. Publish runs in `SignupHeader`'s scope, Close signup in the sheet's. */
export function MobileSignupHeader({
  title,
  status,
  publicUrl,
  closeQuestion,
  closeQuestionAction,
  closeAction,
}: MobileSignupHeaderProps) {
  const [question, askAgain] = useCloseQuestion(closeQuestion, closeQuestionAction);
  // The status the More actions sheet was opened on. Publishing or closing
  // changes the status, which closes the sheet rather than leaving it open on
  // what the signup can do next: after Publish the share sheet opens instead.
  const [menuFor, setMenuFor] = useState<SignupStatus | null>(null);
  const menuOpen = menuFor === status;
  const hasActions = status === 'draft' || status === 'open';

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1">
              <StatusPill status={status} />
            </div>
            <h1
              tabIndex={-1}
              data-signup-title
              className="truncate text-xl font-semibold tracking-tight text-ink"
            >
              {title}
            </h1>
          </div>
          {/* The menu holds Publish or Close signup. A closed or archived
              signup has neither, so there's no menu to open, and focus goes
              to the title once Close signup has closed it. */}
          {hasActions ? (
            <button
              type="button"
              onClick={() => {
                setMenuFor(status);
                if (status === 'open') askAgain();
              }}
              aria-label="More actions"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <PublicLinkChip url={publicUrl} />
        {status === 'open' ? <ShareButton variant="phone" /> : null}
      </header>

      <MobileMoreMenuSheet
        open={menuOpen}
        onClose={() => setMenuFor(null)}
        status={status}
        title={title}
        closeQuestion={question}
        closeAction={closeAction}
      />
    </>
  );
}
