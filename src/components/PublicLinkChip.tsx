'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

interface PublicLinkChipProps {
  url: string;
  compact?: boolean;
}

export function PublicLinkChip({ url, compact = false }: PublicLinkChipProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard API can fail (e.g. insecure context). Stay quiet.
    }
  }

  return (
    <div className="border-surface-sunk bg-surface-raised text-ink inline-flex max-w-full items-center rounded-full border py-0.5 pr-1 pl-3 text-[13px]">
      {!compact ? (
        <span className="text-ink-muted border-surface-sunk mr-2 border-r pr-2 text-xs font-medium">
          Public link
        </span>
      ) : null}
      <span className="text-ink mr-2 min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy public link"
        title="Copy"
        className={`inline-flex items-center justify-center rounded-full p-1.5 transition ${
          copied ? 'bg-success/10 text-success' : 'text-ink-muted hover:text-ink'
        }`}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open public page"
        title="Open"
        className="text-ink-muted hover:text-ink inline-flex items-center justify-center rounded-full p-1.5 transition"
      >
        <ExternalLink size={16} aria-hidden="true" />
      </a>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}
