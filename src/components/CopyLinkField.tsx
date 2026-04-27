'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyLinkFieldProps {
  url: string;
}

export default function CopyLinkField({ url }: CopyLinkFieldProps) {
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
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (e.g. insecure context). Stay quiet — the
      // URL is still a clickable link as a fallback.
    }
  }

  return (
    <div className="text-ink-muted mt-2 flex items-center gap-3 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate font-mono underline hover:no-underline"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        title="Copy link"
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition hover:text-ink ${
          copied ? 'text-success' : 'text-ink-muted'
        }`}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </div>
  );
}
