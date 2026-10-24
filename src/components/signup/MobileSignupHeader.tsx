'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import { useCloseQuestion, type CloseQuestionAction } from './CloseSignupConfirm';
import type { StatusAction } from './StatusActionForm';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';

interface MobileSignupHeaderProps {
  signupId: string;
  title: string;
  status: SignupStatus;
  publicUrl: string;
  closeQuestion: string;
  closeQuestionAction: CloseQuestionAction;
  publishAction: StatusAction;
  closeAction: StatusAction;
}

export function MobileSignupHeader({
  signupId,
  title,
  status,
  publicUrl,
  closeQuestion,
  closeQuestionAction,
  publishAction,
  closeAction,
}: MobileSignupHeaderProps) {
  const [question, askAgain] = useCloseQuestion(closeQuestion, closeQuestionAction);
  const [menuOpen, setMenuOpen] = useState(false);
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
                setMenuOpen(true);
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

        <PublicLinkChip url={publicUrl} signupId={signupId} />
      </header>

      {/* Closing the signup closes the sheet too, rather than leaving it open
          with nothing in it. */}
      <MobileMoreMenuSheet
        open={menuOpen && hasActions}
        onClose={() => setMenuOpen(false)}
        status={status}
        title={title}
        closeQuestion={question}
        publishAction={publishAction}
        closeAction={closeAction}
      />
    </>
  );
}
