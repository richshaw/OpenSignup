'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import { StatusPill } from '@/components/status-pill';
import type { SignupStatus } from '@/schemas/signups';
import { MobileMoreMenuSheet } from './MobileMoreMenuSheet';

interface MobileSignupHeaderProps {
  signupId: string;
  title: string;
  description: string | null;
  status: SignupStatus;
  publicUrl: string;
  publishAction: () => void | Promise<void>;
  closeAction: () => void | Promise<void>;
}

export function MobileSignupHeader({
  signupId,
  title,
  description,
  status,
  publicUrl,
  publishAction,
  closeAction,
}: MobileSignupHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="More actions"
            className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
        </div>

        {description ? (
          <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}

        <PublicLinkChip url={publicUrl} />
      </header>

      <MobileMoreMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        signupId={signupId}
        status={status}
        title={title}
        publishAction={publishAction}
        closeAction={closeAction}
      />
    </>
  );
}
