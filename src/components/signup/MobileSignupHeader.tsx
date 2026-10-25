'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import { useCloseQuestion, type CloseQuestionAction } from './CloseSignupConfirm';
import type { StatusChangeAction } from './StatusActionForm';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';
import { PhoneBar } from './PhoneBar';

interface MobileSignupHeaderProps {
  title: string;
  status: SignupStatus;
  /** `PhoneStanding`, rendered on the server: the draft line, or the link. */
  standing: ReactNode;
  /** `PhonePreviewItem`, rendered on the server, for the More actions sheet. */
  previewItem: ReactNode;
  /** From `spotsTakenLine`, for the bar; null for a draft. */
  spotsTaken: string | null;
  closeQuestion: string;
  closeQuestionAction: CloseQuestionAction;
  closeAction: StatusChangeAction;
  reopenAction: StatusChangeAction;
}

/**
 * The phone's header, and the bar at the bottom of the screen that holds
 * Publish and share, or Share. Publish runs in `SignupHeader`'s scope, Close
 * signup in the More actions sheet's, and Reopen signup in its own there.
 */
export function MobileSignupHeader({
  title,
  status,
  standing,
  previewItem,
  spotsTaken,
  closeQuestion,
  closeQuestionAction,
  closeAction,
  reopenAction,
}: MobileSignupHeaderProps) {
  const [question, askAgain] = useCloseQuestion(closeQuestion, closeQuestionAction);
  // The status the More actions sheet was opened on. Close signup and Reopen
  // signup change the status, which closes the sheet rather than leaving it
  // open on what the signup can do next. Forgotten as soon as the status
  // changes, so a change back made anywhere doesn't open the sheet again.
  const [menuFor, setMenuFor] = useState<SignupStatus | null>(null);
  if (menuFor !== null && menuFor !== status) setMenuFor(null);
  const menuOpen = menuFor === status;

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
          {/* The menu holds Preview, with Close signup once it's open and
              Reopen signup once it's closed. An archived signup has none of
              them. */}
          {status !== 'archived' ? (
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

        {standing}
      </header>

      <PhoneBar status={status} spotsTaken={spotsTaken} />

      <MobileMoreMenuSheet
        open={menuOpen}
        onClose={() => setMenuFor(null)}
        status={status}
        title={title}
        previewItem={previewItem}
        closeQuestion={question}
        closeAction={closeAction}
        reopenAction={reopenAction}
      />
    </>
  );
}
