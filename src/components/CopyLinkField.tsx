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
      // URL is still a clickable link as a fallback.
    }
  }

  return (
    <div className="text-ink-muted mt-2 flex items-center gap-3 text-sm">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate underline hover:no-underline"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="text-brand shrink-0 underline transition hover:no-underline"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
