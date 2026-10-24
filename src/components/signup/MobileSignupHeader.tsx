'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import { useCloseQuestion, type CloseQuestionAction } from './CloseSignupConfirm';
import type { StatusAction } from './StatusActionForm';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';
import { PhoneBar } from './PhoneBar';
import { hasPhoneBar } from './phone-bar';

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
  closeAction: StatusAction;
}

/**
 * The phone's header, and the bar at the bottom of the screen that holds
 * Publish and share, or Share. Publish runs in `SignupHeader`'s scope, Close
 * signup in the More actions sheet's.
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
}: MobileSignupHeaderProps) {
  const [question, askAgain] = useCloseQuestion(closeQuestion, closeQuestionAction);
  // The status the More actions sheet was opened on. Close signup changes
  // the status, which closes the sheet rather than leaving it open on what
  // the signup can do next.
  const [menuFor, setMenuFor] = useState<SignupStatus | null>(null);
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
          {/* The menu holds Preview, and Close signup once it's open, so it
              comes and goes with the bar. A closed or archived signup has
              neither, and focus goes to the title once Close signup has
              closed it. */}
          {hasPhoneBar(status) ? (
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
      />
    </>
  );
}
