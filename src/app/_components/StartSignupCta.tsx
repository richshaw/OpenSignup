'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { emitLandingCtaClicked } from './landingCtaTelemetry';

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
    <Link href={href} className={className} onClick={() => emitLandingCtaClicked('start_signup')}>
      {children}
    </Link>
  );
}
