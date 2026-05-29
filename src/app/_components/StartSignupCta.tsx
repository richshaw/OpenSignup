'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const TELEMETRY_URL = '/api/telemetry/landing-cta-clicked';

function emit(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(TELEMETRY_URL, new Blob([], { type: 'text/plain' }));
      if (ok) return;
    }
    void fetch(TELEMETRY_URL, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    // Telemetry must never break the click.
  }
}

export function StartSignupCta({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={emit}>
      {children}
    </Link>
  );
}
