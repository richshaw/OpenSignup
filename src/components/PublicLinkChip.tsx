'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useClipboardCopy } from '@/hooks/useClipboardCopy';
import { emitSignupLinkEvent, type SignupLinkCopySurface } from '@/lib/signup-link-events';

interface PublicLinkChipProps {
  url: string;
  /** The signup the link is for, so a copy is recorded against it. */
  signupId: string;
  /** Where a copy is recorded as made: the header, unless said otherwise. */
  surface?: SignupLinkCopySurface;
  className?: string;
}

export function PublicLinkChip({
  url,
  signupId,
  surface = 'header',
  className = '',
}: PublicLinkChipProps) {
  const { copied, copy } = useClipboardCopy(1400);

  async function handleCopy() {
    // The clipboard can refuse (e.g. an insecure context): then stay quiet,
    // and record nothing.
    if (await copy(url)) emitSignupLinkEvent(signupId, 'copied', surface);
  }

  return (
    <div
      className={`inline-flex max-w-full items-center rounded-full border border-surface-sunk bg-surface-raised pl-3 pr-1 text-[13px] text-ink sm:py-0.5 ${className}`}
    >
      <span className="mr-2 border-r border-surface-sunk pr-2 text-xs font-medium text-ink-muted">
        Public link
      </span>
      <span className="mr-2 min-w-0 flex-1 truncate font-mono text-xs text-ink">{url}</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy public link"
        title="Copy"
        className={`inline-flex items-center justify-center rounded-full p-1.5 transition max-sm:size-11 ${
          copied ? 'bg-success/10 text-success' : 'text-ink-muted hover:text-ink'
        }`}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open public page"
        title="Open"
        className="inline-flex items-center justify-center rounded-full p-1.5 text-ink-muted transition hover:text-ink max-sm:size-11"
      >
        <ExternalLink size={16} aria-hidden="true" />
      </a>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}
