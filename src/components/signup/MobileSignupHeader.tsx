'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import type { StatusAction } from './StatusActionForm';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';

interface MobileSignupHeaderProps {
  title: string;
  status: SignupStatus;
  publicUrl: string;
  publishAction: StatusAction;
  closeAction: StatusAction;
}

export function MobileSignupHeader({
  title,
  status,
  publicUrl,
  publishAction,
  closeAction,
}: MobileSignupHeaderProps) {
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
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>
          </div>
          {/* The menu holds Publish or Close signup. A closed or archived
              signup has neither, so there's no menu to open. */}
          {hasActions ? (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="More actions"
              className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <PublicLinkChip url={publicUrl} />
      </header>

      <MobileMoreMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        status={status}
        title={title}
        publishAction={publishAction}
        closeAction={closeAction}
      />
    </>
  );
}
