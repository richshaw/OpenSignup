'use client';

import { useEffect, useRef, useState } from 'react';

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
      // URL is still selectable in the input as a fallback.
    }
  }

  return (
    <div className="mt-2 flex w-full max-w-xl items-center gap-2">
      <input
        type="text"
        value={url}
        readOnly
        aria-label="Public share URL"
        onFocus={(e) => e.currentTarget.select()}
        className="text-ink min-w-0 flex-1 truncate rounded-lg border border-surface-sunk bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className="bg-brand shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-brand shrink-0 text-sm underline"
      >
        Open
      </a>
    </div>
  );
}
